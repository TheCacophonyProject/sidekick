package nz.org.cacophony.sidekick

import android.app.Activity
import android.content.Intent
import android.location.Location
import android.net.Uri
import android.os.Environment
import android.provider.Browser
import android.util.Log
import okhttp3.*
import okio.Okio
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.net.ConnectException
import java.net.HttpURLConnection
import java.net.SocketException
import java.net.URL
import kotlin.concurrent.thread


class Device(
        @Volatile var name: String,
        val hostname: String,
        private val port: Int,
        private val activity: Activity,
        private val onChange: (() -> Unit)?,
        private val messenger: Messenger,
        private val dao: RecordingDao) {
    @Volatile
    var deviceRecordings = emptyArray<String>()
    @Volatile
    var statusString = ""
    @Volatile
    var numRecToDownload = 0
    @Volatile
    var sm = StateMachine()
    @Volatile
    var downloading = false
    private val client: OkHttpClient = OkHttpClient()
    private val pr = PermissionHelper(activity.applicationContext)
    private var devicename: String = name
    private var groupname: String? = null
    private var deviceID: Int = 0

    init {
        Log.i(TAG, "Created new device: $name")
        makeDeviceDir()
        thread(start = true) {
            for (i in 3.downTo(0)) {
                checkConnectionStatus()
                if (sm.state == DeviceState.CONNECTED) {
                    break
                }
                if (i > 0) {
                    Log.i(TAG, "failed to connect to interface, trying $i more times")
                } else {
                    Log.e(TAG, "failed to connect to interface")
                }
            }
            getDeviceInfo()
            updateRecordings()
        }
    }

    fun getDeviceInfo() {
        if (sm.state != DeviceState.CONNECTED && sm.state != DeviceState.READY) {
            return
        }

        //for now so devices without latest management will still work
        sm.gotDeviceInfo()
        val deviceJSON: JSONObject
        try {

            deviceJSON = JSONObject(apiRequest("GET", "/api/device-info").responseString)
        } catch (e: Exception) {
            Log.e(TAG, "Exception when getting device info: $e")
            return
        }
        devicename = deviceJSON.getString("devicename")
        if (devicename.isEmpty()) {
            devicename = name
        }
        groupname = deviceJSON.getString("groupname")
        deviceID = deviceJSON.getInt("deviceID")

        sm.gotDeviceInfo()
        updateStatusString()
    }

    fun updateRecordings() {
        updateRecordingsList()
        val uploadedRecordings = dao.getUploadedFromDevice(devicename, groupname)
        if (!checkConnectionStatus(showMessage = true)) {
            return
        }
        var allDeleted = true
        for (rec in uploadedRecordings) {
            Log.i(TAG, "Uploaded recording: $rec")
            if (rec.name in deviceRecordings) {
                allDeleted = allDeleted && deleteRecording(rec)
            } else {
                dao.deleteRecording(rec.id)
            }
        }
        if (!allDeleted) {
            messenger.alert("Failed to delete some old recordings from device")
        }
        updateNumberOfRecordingsToDownload()
    }

    // Delete recording from device and Database. Recording file is deleted when uploaded to the server
    private fun deleteRecording(recording: Recording): Boolean {
        try {
            val request = Request.Builder()
                    .url(URL("http", hostname, port, "/api/recording/${recording.name}"))
                    .addHeader("Authorization", getAuthString())
                    .delete()
                    .build()

            val response = client.newCall(request).execute()
            if (response.isSuccessful) {
                dao.deleteRecording(recording.id)
                return true
            }
            val code = response.code()
            Log.i(TAG, "Delete recording '${recording.name}' on '$name' failed with code $code")
            if (code == 403) {
                messenger.toast("Not authorized to delete recordings from '$name'")
            } else {
                messenger.toast("Failed to delete '${recording.name}' from '$name'. Response code: '$code'")
            }

        } catch (e: Exception) {
            Log.e(TAG, "Exception when deleting recording from device: $e")
        }
        return false
    }

    // Get list of recordings on the device
    private fun updateRecordingsList() {
        if (!checkConnectionStatus()) {
            return
        }
        val recJSON: JSONArray
        try {
            recJSON = JSONArray(apiRequest("GET", "/api/recordings").responseString)  //TODO check response from apiRequest
        } catch (e: Exception) {
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
        } else if (deviceRecordings.isEmpty()) {
            newStatus = "No recordings left on device"
        } else if (sm.state == DeviceState.DOWNLOADING_RECORDINGS) {
            newStatus = "Downloaded ${deviceRecordings.size - numRecToDownload} of ${deviceRecordings.size}"
        } else if (numRecToDownload == 0) {
            newStatus = "All ${deviceRecordings.size} recordings downloaded"
        } else if (numRecToDownload == 1) {
            newStatus = "1 recording to download"
        } else if (numRecToDownload > 1) {
            newStatus = "$numRecToDownload recording to download"
        }

        if (newStatus != statusString) {
            statusString = newStatus
            onChange?.invoke()
        }
    }

    private fun updateNumberOfRecordingsToDownload() {
        // Count the number of recordings that are on the device and not in the database
        val downloadedRecordings = dao.getRecordingNamesFromDevice(devicename, groupname)
        var count = 0
        for (rec in deviceRecordings) {
            if (rec !in downloadedRecordings) {
                count++
            }
        }
        numRecToDownload = count
    }

    fun startDownloadRecordings() {
        if (sm.state != DeviceState.READY) {
            return
        }
        if (!pr.check(android.Manifest.permission.WRITE_EXTERNAL_STORAGE)) {
            messenger.alert("App doesn't have permission to write to storage. Canceling download.")
            return
        }
        if (!makeDeviceDir()) {
            messenger.alert("Failed to write to local storage. Canceling download.")
            return
        }
        if (downloading) {
            return
        }
        downloading = true
        sm.downloadingRecordings(true)
        updateRecordings()
        Log.i(TAG, "Download recordings from '$name'")

        val downloadedRecordings = dao.getRecordingNamesFromDevice(devicename, groupname)
        Log.i(TAG, "recordings $deviceRecordings")

        var allDownloaded = true
        for (recordingName in deviceRecordings) {
            Log.i(TAG, recordingName)
            if (recordingName !in downloadedRecordings) {
                Log.i(TAG, "Downloading recording $recordingName")
                if (downloadRecording(recordingName)) {
                    val outFile = File(getDeviceDir(), recordingName)
                    val recording = Recording(devicename, outFile.toString(), recordingName, groupname, deviceID)
                    dao.insert(recording)
                } else {
                    allDownloaded = false
                    if (!checkConnectionStatus(showMessage = true)) break
                }
                updateStatusString()
                //TODO note in the db if the recording failed
            } else {
                Log.i(TAG, "Already downloaded $recordingName")
            }
        }
        if (!allDownloaded) {
            messenger.alert("Failed to download some recordings")
        }
        sm.downloadingRecordings(false)
        downloading = false
        updateStatusString()
    }

    private fun downloadRecording(recordingName: String): Boolean {
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
                messenger.toast("Not authorized to download recordings from '$name'")
            } else {
                messenger.toast("Failed to download recording '$recordingName' from '$name'. Response code: '$code'")
            }
        } catch (e: Exception) {
            messenger.toast("Error with downloading recording from '$name'")
            Log.e(TAG, "Exception when downloading recording: $e")
        }
        return false
    }

    private fun getDeviceDir(): File {
        return File("${Environment.getExternalStorageDirectory()}/cacophony-sidekick/$name")
    }

    private fun makeDeviceDir(): Boolean {
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
                } catch (e: Exception) {
                    Log.i(TAG, "Error with connecting to device")
                }
            }
        } catch (e: Exception) {
            Log.i(TAG, "Error with apiRequest")
        }
        Log.i(TAG, response)
        return HttpResponse(con, response)
    }

    fun openManagementInterface() {
        thread(start = true) {
            Log.i(TAG, "open interface")
            if (checkConnectionStatus(timeout = 1000, showMessage = true, retries = 1)) {
                val httpBuilder = HttpUrl.parse(URL("http", hostname, port, "/").toString())!!.newBuilder()
                val groupList = CacophonyAPI.getGroupList(activity.application.applicationContext)
                httpBuilder.addQueryParameter("groups", groupList?.joinToString("--"))
                val uri = Uri.parse(httpBuilder.build().toString())
                Log.d(TAG, "opening browser to: $uri")
                val urlIntent = Intent(Intent.ACTION_VIEW, uri)
                urlIntent.putExtra(Browser.EXTRA_APPLICATION_ID, "$TAG-$name")  // Single browse tab per device
                activity.startActivity(urlIntent)
            }
        }
    }

    fun checkConnectionStatus(timeout: Int = 3000, showMessage: Boolean = false, retries: Int = 3): Boolean {
        var connected = false
        for (i in 1..retries) {
            updateStatusString()
            try {
                val conn = URL("http://$hostname").openConnection() as HttpURLConnection
                conn.connectTimeout = timeout
                conn.readTimeout = timeout
                conn.responseCode
                conn.disconnect()
                sm.connected()
                connected = true
                break
            } catch (e: SocketException) {
                Log.i(TAG, "failed to connect to device")
                sm.connectionFailed()
            } catch (e: ConnectException) {
                sm.connectionToDeviceOnly()
                Log.i(TAG, "failed to connect to interface")
            } catch (e: Exception) {
                Log.e(TAG, "failed connecting to device $e")
                sm.connectionFailed()
            }
            if (i != retries) {
                updateStatusString()
                Thread.sleep(3000)
            }
        }
        if (showMessage && !connected) {
            messenger.alert("$name: ${sm.state.message}")
        }
        updateStatusString()
        return connected
    }

    fun updateLocation(location: Location): Boolean {
        val client = OkHttpClient()
        val body = FormBody.Builder()
                .addEncoded("latitude", location.latitude.toString())
                .addEncoded("longitude", location.longitude.toString())
                .addEncoded("timestamp", location.time.toString())
                .addEncoded("altitude", location.altitude.toString())
                .addEncoded("accuracy", location.accuracy.toString())
                .build()
        val request = Request.Builder()
                .url(URL("http", hostname, port, "/api/location"))
                .addHeader("Authorization", getAuthString())
                .post(body)
                .build()
        var updated = false
        try {
            var response = client.newCall(request).execute()
            var responseBody = ""
            if (response.body() != null) {
                responseBody = (response.body() as ResponseBody).string()  //This also closes the body
            }
            Log.d(TAG, "Location update response: '$responseBody'")
            updated = response.code() == 200
        } catch (e: Exception) {
            Log.i(TAG, "failed to update location on device: $e")
        }
        return updated
    }
}

data class HttpResponse(val connection: HttpURLConnection, val responseString: String)

class StateMachine {

    var state = DeviceState.FOUND
    var hasRecordingList = false
    var hasDeviceInfo = false
    var hasConnected = false

    fun downloadingRecordings(downloading: Boolean) {
        if (downloading) {
            updateState(DeviceState.DOWNLOADING_RECORDINGS)
        } else if (state == DeviceState.DOWNLOADING_RECORDINGS) {
            updateState(DeviceState.READY)
        }
    }

    fun connected() {
        hasConnected = true
        if (!state.connected) {
            if (hasDeviceInfo) {
                updateState(DeviceState.READY)
            } else {
                updateState(DeviceState.CONNECTED)
            }
        }
    }

    fun connectionToDeviceOnly() {
        hasConnected = true
        updateState(DeviceState.ERROR_CONNECTING_TO_INTERFACE)
    }

    fun connectionFailed() {
        updateState(DeviceState.ERROR_CONNECTING_TO_DEVICE)
    }

    fun connecting() {
        if (hasConnected) {
            updateState(DeviceState.RECONNECT)
        }
    }

    fun gotDeviceInfo() {
        hasDeviceInfo = true
        updateState(DeviceState.READY)
    }

    fun updatedRecordingList() {
        hasRecordingList = true
    }

    private fun updateState(newState: DeviceState) {
        if (state == newState) return
        val validSwitch = when (state) {
            DeviceState.FOUND -> {
                true
            }
            DeviceState.RECONNECT -> {
                true
            }
            DeviceState.CONNECTED -> {
                newState in arrayListOf(
                        DeviceState.READY,
                        DeviceState.ERROR_CONNECTING_TO_INTERFACE,
                        DeviceState.ERROR_CONNECTING_TO_DEVICE,
                        DeviceState.RECONNECT
                )
            }
            DeviceState.READY -> {
                newState in arrayListOf(
                        DeviceState.DOWNLOADING_RECORDINGS,
                        DeviceState.ERROR_CONNECTING_TO_INTERFACE,
                        DeviceState.ERROR_CONNECTING_TO_DEVICE,
                        DeviceState.RECONNECT
                )
            }
            DeviceState.DOWNLOADING_RECORDINGS -> {
                newState in arrayListOf(
                        DeviceState.READY,
                        DeviceState.ERROR_CONNECTING_TO_INTERFACE,
                        DeviceState.ERROR_CONNECTING_TO_DEVICE,
                        DeviceState.RECONNECT
                )
            }
            DeviceState.ERROR_CONNECTING_TO_DEVICE -> {
                newState in arrayListOf(
                        DeviceState.CONNECTED,
                        DeviceState.ERROR_CONNECTING_TO_DEVICE,
                        DeviceState.RECONNECT
                )
            }
            DeviceState.ERROR_CONNECTING_TO_INTERFACE -> {
                newState in arrayListOf(
                        DeviceState.CONNECTED,
                        DeviceState.ERROR_CONNECTING_TO_DEVICE,
                        DeviceState.RECONNECT
                )
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

enum class DeviceState(val message: String, val connected: Boolean) {
    FOUND("Found device. Trying to connect", false),
    CONNECTED("Connected.", true),
    RECONNECT("Trying to reconnect", false),
    READY("Got device info.", true),
    DOWNLOADING_RECORDINGS("Downloading recordings.", true),
    ERROR_CONNECTING_TO_DEVICE("Error connecting.", false),
    ERROR_CONNECTING_TO_INTERFACE("Error connecting to interface.", false),
}
