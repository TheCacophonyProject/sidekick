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
        private val dao: RecordingDao,
        private val hasWritePermission: () -> Boolean) {
    @Volatile var deviceRecordings = emptyArray<String>()
    @Volatile var gotDevicesRecordings = false
    @Volatile var statusString = ""
    @Volatile var downloading = false
    @Volatile var numRecToDownload = 0
    @Volatile var connectedToInterface = false
    @Volatile var connectedToDevice = false
    private val client :OkHttpClient = OkHttpClient()

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
        checkConnectionStatus(showToast = true)
        if (!connectedToInterface) {
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
        checkConnectionStatus()
        if (!connectedToInterface) {
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
        gotDevicesRecordings = true
        updateStatusString()
    }

    private fun updateStatusString() {
        updateNumberOfRecordingsToDownload()
        var newStatus = ""
        if (!connectedToDevice) {
            newStatus = "Failed to connect to device"
        } else if (!connectedToInterface) {
            newStatus = "Failed to connect to interface"
        } else if (!gotDevicesRecordings) {
            newStatus = "Looking for recordings"
        } else if (numRecToDownload == 1) {
            newStatus = "$numRecToDownload recording to download."
        } else  if (numRecToDownload > 1){
            newStatus = "$numRecToDownload recordings to download."
        } else if (numRecToDownload == 0){
            newStatus = "No recordings to download."
        } else if (numRecToDownload == -1) {
            newStatus = "Checking for downloads..."
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
        if (downloading) {
            return
        }
        if (!hasWritePermission()) {
            makeToast("App doesn't have permission to write to storage. Canceling download.", Toast.LENGTH_LONG)
            return
        }
        if (!makeDeviceDir()) {
            makeToast("Failed to write to local storage. Canceling download.", Toast.LENGTH_SHORT)
            return
        }
        thread(start = true) {
            downloading = true
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
                        checkConnectionStatus(showToast = true)
                        if (!connectedToInterface) break
                    }
                    updateStatusString()
                    //TODO note in the db if the recording failed
                } else {
                    Log.i(TAG, "Already downloaded $recordingName")
                }
            }
            downloading = false
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
        val uri = Uri.parse(URL("http", hostname, port, "/").toString())
        Log.d(TAG, "opening browser to: $uri")
        val urlIntent = Intent(Intent.ACTION_VIEW, uri)
        urlIntent.putExtra(Browser.EXTRA_APPLICATION_ID, "$TAG-$name")  // Single browse tab per device
        activity.startActivity(urlIntent)
    }

    fun checkConnectionStatus(timeout : Int = 3000, showToast : Boolean = false) {
        try {
            val socket = Socket()
            socket.connect(InetSocketAddress(hostname, port), timeout)
            socket.close()
            connectedToInterface = true
            connectedToDevice = true
        } catch (e: Exception) {
            Log.e(TAG, e.toString())
            connectedToInterface = false
            connectedToDevice = InetAddress.getByName(hostname).isReachable(timeout)
        }
        if (showToast && !connectedToDevice) {
            makeToast("Failed to connect to '$name'.", Toast.LENGTH_SHORT)
        } else if (showToast && !connectedToInterface) {
            makeToast("Failed to connect to '$name' management interface.", Toast.LENGTH_SHORT)
        }
        updateStatusString()
    }
}

data class HttpResponse (val connection : HttpURLConnection, val responseString : String)
