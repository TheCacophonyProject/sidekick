package nz.org.cacophony.sidekick

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.provider.Browser
import android.util.Log
import android.widget.Toast
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.ResponseBody
import org.json.JSONArray
import java.io.*
import java.lang.Exception
import kotlin.concurrent.thread
import okio.Okio
import java.net.*


class Device(
        val name: String,
        private val hostname: String,
        private val port: Int,
        private val activity: Activity,
        private val onChange: (() -> Unit)?,
        private val makeToast: (m: String, i : Int) -> Unit,
        private val dao: RecordingDao) {
    @Volatile var deviceRecordings = emptyArray<String>()
    @Volatile var statusString = ""
    @Volatile var numRecToDownload = 0
    @Volatile var sm = StateMachine()
    private val client :OkHttpClient = OkHttpClient()
    private val pr = PermissionHelper(activity.applicationContext)

    init {
        Log.i(TAG, "Created new device: $name")
        makeDeviceDir()
        thread(start = true) {
            checkConnectionStatus()
            updateRecordings()
        }
    }

    fun updateRecordings() {
        updateRecordingsList()
        val uploadedRecordings = dao.getUploadedFromDevice(name)
        if (!checkConnectionStatus(showToast = true)) {
            return
        }
        for (rec in uploadedRecordings) {
            Log.i(TAG, "Uploaded recording: $rec")
            if (rec.name in deviceRecordings) {
                //TODO have error message show when deletion fails
                if (deleteRecording(rec.name)) {
                    dao.deleteRecording(rec.id)
                }
            } else {
                dao.deleteRecording(rec.id)
            }
        }
        updateNumberOfRecordingsToDownload()
    }

    // Delete recording from device and Database. Recording file is deleted when uploaded to the server
    private fun deleteRecording(recordingName: String) : Boolean {
        try {
            val request = Request.Builder()
                    .url(URL("http", hostname, port, "/api/recording/$recordingName"))
                    .addHeader("Authorization", getAuthString())
                    .delete()
                    .build()

            val response = client.newCall(request).execute()

            if (response.isSuccessful) {
                return true
            }
            val code = response.code()
            Log.i(TAG, "Delete recording '$recordingName' on '$name' failed with code $code")
            if (code == 403) {
                makeToast("Not authorized to delete recordings from '$name'", Toast.LENGTH_LONG)
            } else {
                makeToast("Failed to delete '$recordingName' from '$name'. Response code: '$code'", Toast.LENGTH_LONG)
            }

        } catch (e : Exception) {
            Log.e(TAG, "Exception when deleting recording from device: $e")
        }
        return false
    }

    // Get list of recordings on the device
    private fun updateRecordingsList() {
        if (!checkConnectionStatus()) {
            return
        }
        val recJSON : JSONArray
        try {
            recJSON = JSONArray(apiRequest("GET", "/api/recordings").responseString)  //TODO check response from apiRequest
        } catch(e :Exception) {
            Log.e(TAG, "Exception when updating recording list: $e")
            return
        }
        deviceRecordings = emptyArray<String>()
        for (i in 0 until recJSON.length()) {
            deviceRecordings = deviceRecordings.plus(recJSON.get(i) as String)
        }
        sm.updatedRecordingList()
        updateStatusString()
    }

    private fun updateStatusString() {
        updateNumberOfRecordingsToDownload()
        var newStatus = ""

        if (!sm.state.connected) {
            newStatus = sm.state.message
        } else if (!sm.hasRecordingList) {
            newStatus = "Checking for recordings"
        } else if (numRecToDownload == 0) {
            newStatus = "No recordings to download"
        } else if (numRecToDownload == 1) {
            newStatus = "1 recording to download"
        } else if (numRecToDownload > 1) {
            newStatus = "$numRecToDownload recordings to download"
        }

        if (!newStatus.equals(statusString)) {
            statusString = newStatus
            onChange?.invoke()
        }
    }

    private fun updateNumberOfRecordingsToDownload() {
        // Count the number of recordings that are on the device and not in the database
        val downloadedRecordings = dao.getRecordingNamesFromDevice(name)
        var count = 0
        for (rec in deviceRecordings) {
            if (rec !in downloadedRecordings) {
                count++
            }
        }
        numRecToDownload = count
    }

    fun startDownloadRecordings() {
        if (sm.state != DeviceState.CONNECTED) {
            return
        }
        if (!pr.check(android.Manifest.permission.WRITE_EXTERNAL_STORAGE)) {
            makeToast("App doesn't have permission to write to storage. Canceling download.", Toast.LENGTH_LONG)
            return
        }
        if (!makeDeviceDir()) {
            makeToast("Failed to write to local storage. Canceling download.", Toast.LENGTH_SHORT)
            return
        }
        thread(start = true) {
            sm.downloadingRecordings(true)
            updateRecordings()
            Log.i(TAG, "Download recordings from '$name'")

            val downloadedRecordings = dao.getRecordingNamesFromDevice(name)
            Log.i(TAG, "recordings $deviceRecordings")

            for (recordingName in deviceRecordings) {
                Log.i(TAG, recordingName)
                if (recordingName !in downloadedRecordings) {
                    Log.i(TAG, "Downloading recording $recordingName")
                    if (downloadRecording(recordingName)) {
                        val outFile = File(getDeviceDir(), recordingName)
                        val recording = Recording(name, outFile.toString(), recordingName)
                        dao.insert(recording)
                    } else {
                        if (!checkConnectionStatus(showToast = true)) break
                    }
                    updateStatusString()
                    //TODO note in the db if the recording failed
                } else {
                    Log.i(TAG, "Already downloaded $recordingName")
                }
            }
            sm.downloadingRecordings(false)
        }
    }

    private fun downloadRecording(recordingName: String) : Boolean {
        try {
            val request = Request.Builder()
                    .url(URL("http", hostname, port, "/api/recording/$recordingName"))
                    .addHeader("Authorization", getAuthString())
                    .get()
                    .build()

            val response = client.newCall(request).execute()
            if (response.isSuccessful) {
                val downloadedFile = File(getDeviceDir(), recordingName)
                val sink = Okio.buffer(Okio.sink(downloadedFile))
                sink.writeAll((response.body() as ResponseBody).source())
                sink.close()
                response.close()
                return true
            }
            val code = response.code()
            Log.i(TAG, "Failed downloading '$recordingName' from '$name'. Response code: $code")
            if (code == 403) {
                makeToast("Not authorized to download recordings from '$name'", Toast.LENGTH_LONG)
            } else {
                makeToast("Failed to download recording '$recordingName' from '$name'. Response code: '$code'", Toast.LENGTH_LONG)
            }
        } catch (e: Exception) {
            makeToast("Error with downloading recording from '$name'", Toast.LENGTH_LONG)
            Log.e(TAG, "Exception when downloading recording: $e")
        }
        return false
    }

    private fun getDeviceDir(): File {
        return File("${Environment.getExternalStorageDirectory()}/cacophony-sidekick/$name")
    }

    private fun makeDeviceDir() : Boolean {
        return getDeviceDir().isDirectory || getDeviceDir().mkdirs()
    }

    private fun getAuthString(): String {
        //TODO Add better security...
        return "Basic YWRtaW46ZmVhdGhlcnM="
    }

    private fun apiRequest(method: String, path: String): HttpResponse {
        val url = URL("http", hostname, port, path)
        val con = url.openConnection() as HttpURLConnection
        con.requestMethod = method
        con.setRequestProperty("Authorization", getAuthString())

        var response = ""
        Log.d(TAG, "New request to: $url")
        try {
            with(con) {
                requestMethod = method
                try {
                    BufferedReader(InputStreamReader(inputStream)).use {
                        val responseBuffer = StringBuffer()
                        var inputLine = it.readLine()
                        while (inputLine != null) {
                            responseBuffer.append(inputLine)
                            inputLine = it.readLine()
                        }
                        response = responseBuffer.toString()
                    }
                } catch(e: Exception) {
                    Log.i(TAG, "Error with connecting to device")
                }
            }
        } catch(e: Exception) {
            Log.i(TAG, "Error with apiRequest")
        }
        Log.i(TAG, response)
        return HttpResponse(con, response)
    }

    fun openManagementInterface() {
        thread(start = true) {
            Log.i(TAG, "open interface")
            if (checkConnectionStatus(timeout = 1000, showToast = true)) {
                val uri = Uri.parse(URL("http", hostname, port, "/").toString())
                Log.d(TAG, "opening browser to: $uri")
                val urlIntent = Intent(Intent.ACTION_VIEW, uri)
                urlIntent.putExtra(Browser.EXTRA_APPLICATION_ID, "$TAG-$name")  // Single browse tab per device
                activity.startActivity(urlIntent)
            }
        }
    }

    fun checkConnectionStatus(timeout : Int = 3000, showToast : Boolean = false) : Boolean {
        var connected = false
        try {
            val conn = URL("http://$hostname").openConnection() as HttpURLConnection
            conn.connectTimeout = timeout
            conn.readTimeout = timeout
            conn.responseCode
            conn.disconnect()
            sm.connectionToInterface(true)
            connected = true
        } catch (e : java.net.SocketException) {
            Log.i(TAG, "failed to connect to device")
            sm.connectionToDevice(false)
        } catch (e : java.net.ConnectException) {
            sm.connectionToDevice(true)
            sm.connectionToInterface(false)
            Log.i(TAG, "failed to connect to interface")
        } catch (e : Exception) {
            Log.e(TAG, "failed connecting to device ${e.toString()}")
            sm.connectionToDevice(false)
        }
        if (showToast && !connected) {
            makeToast("$name: ${sm.state.message}", Toast.LENGTH_SHORT)
        }
        updateStatusString()
        return connected
    }
}

data class HttpResponse (val connection : HttpURLConnection, val responseString : String)

class StateMachine() {

    var state = DeviceState.FOUND
    var hasRecordingList = false

    fun downloadingRecordings(downloading : Boolean) {
        if (downloading) {
            updateState(DeviceState.DOWNLOADING_RECORDINGS)
        } else if (state == DeviceState.DOWNLOADING_RECORDINGS) {
            updateState(DeviceState.CONNECTED)
        }
    }

    fun updatedRecordingList() {
        hasRecordingList = true
    }

    fun connectionToInterface(connected : Boolean) {
        if (connected && !state.connected) {
            updateState(DeviceState.CONNECTED)
        } else if (!connected && state != DeviceState.ERROR_CONNECTING_TO_DEVICE) {
            updateState(DeviceState.ERROR_CONNECTING_TO_INTERFACE)
        }
    }

    fun connectionToDevice(connected : Boolean) {
        if (connected && state == DeviceState.ERROR_CONNECTING_TO_DEVICE) {
            updateState(DeviceState.ERROR_CONNECTING_TO_INTERFACE)
        } else if (!connected) {
            updateState(DeviceState.ERROR_CONNECTING_TO_DEVICE)
        }
    }

    fun updateState(newState : DeviceState) {
        if (state == newState) return
        val validSwitch = when (state) {
            DeviceState.FOUND -> { true }
            DeviceState.CONNECTED -> {
                newState in arrayListOf(
                        DeviceState.DOWNLOADING_RECORDINGS,
                        DeviceState.ERROR_CONNECTING_TO_INTERFACE,
                        DeviceState.ERROR_CONNECTING_TO_DEVICE)
            }
            DeviceState.DOWNLOADING_RECORDINGS -> {
                newState in arrayListOf(
                        DeviceState.CONNECTED,
                        DeviceState.ERROR_CONNECTING_TO_INTERFACE,
                        DeviceState.ERROR_CONNECTING_TO_DEVICE)
            }
            DeviceState.ERROR_CONNECTING_TO_DEVICE -> {
                newState in arrayListOf(
                        DeviceState.CONNECTED,
                        DeviceState.ERROR_CONNECTING_TO_DEVICE)
            }
            DeviceState.ERROR_CONNECTING_TO_INTERFACE -> {
                newState in arrayListOf(
                        DeviceState.CONNECTED,
                        DeviceState.ERROR_CONNECTING_TO_DEVICE)
            }
        }
        if (validSwitch) {
            state = newState
        }
        if (!validSwitch) {
            Log.e(TAG, "Invalid state switch from $state to $newState")
        }
    }
}

enum class DeviceState(val message : String, val connected : Boolean) {
    FOUND("Found device.", false),
    CONNECTED("Connected.", true),
    DOWNLOADING_RECORDINGS("Downloading recordings.", true),
    ERROR_CONNECTING_TO_DEVICE("Error connecting.", false),
    ERROR_CONNECTING_TO_INTERFACE("Error connecting to interface.", false),
}
