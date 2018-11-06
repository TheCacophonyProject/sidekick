package nz.org.cacophony.sidekick

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.provider.Browser
import android.util.Log
import org.json.JSONArray
import java.io.*
import java.lang.Exception
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URL
import kotlin.concurrent.thread


class Device(
        val name: String,
        private val hostname: String,
        private val port: Int,
        private val activity: Activity,
        private val onChange: (() -> Unit)?,
        private val dao: RecordingDao) {
    private var deviceRecordings = emptyArray<String>()
    var recordingsString = "Searching..."
    @Volatile var downloading = false
    var numRecToDownload = 0

    init {
        Log.i(TAG, "Created new device: $name")
        getDeviceDir().mkdirs()
        thread(start = true) {
            updateRecordings()
        }
    }

    fun updateRecordings() {
        updateRecordingsList()
        val uploadedRecordings = dao.getUploadedFromDevice(name)

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
        updateRecordingsList()
    }

    // Delete recording from device and Database. Recording file is deleted when uploaded to the server
    private fun deleteRecording(name: String) : Boolean {
        val httpResponse = apiRequest("DELETE", "/api/recording/$name")
        if (httpResponse.connection.responseCode == 200) {
            Log.i(TAG, "deleted recording '$name' from '$hostname'")
            return true;
        }
        Log.i(TAG, "failed to delete recording '$name' from '$hostname'")
        return false;
    }

    // Get list of recordings on the device
    private fun updateRecordingsList() {
        val recJSON : JSONArray
        try {
            recJSON = JSONArray(apiRequest("GET", "/api/recordings").responseString)  //TODO check response from apiRequest
        } catch(e :Exception) {
            Log.e(TAG, e.toString())
            return
        }
        deviceRecordings = emptyArray<String>()
        for (i in 0 until recJSON.length()) {
            deviceRecordings = deviceRecordings.plus(recJSON.get(i) as String)
        }
        updateRecordingCount()

    }

    private fun updateRecordingCount() {
        updateNumberOfRecordingsToDownload()
        if (numRecToDownload == 1) {
            recordingsString = "$numRecToDownload recording to download."
        } else  if (numRecToDownload > 1){
            recordingsString = "$numRecToDownload recordings to download."
        } else {
            recordingsString = "All recordings downloaded."
        }
        onChange?.invoke()
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
                    try {
                        downloadRecording(recordingName)
                        val outFile = File(getDeviceDir(), recordingName)
                        val recording = Recording(name, outFile.toString(), recordingName)
                        dao.insert(recording)
                        updateRecordingCount()
                    } catch (e: Exception) {
                        Log.i(TAG, e.toString())
                        Log.i(TAG, "failed to download recording")
                    }

                } else {
                    Log.i(TAG, "Already downloaded $recordingName")
                }
            }
            downloading = false
        }
    }

    private fun downloadRecording(id: String) {
        val url = URL("http", hostname, port, "/api/recording/$id")
        val con = url.openConnection() as HttpURLConnection
        con.requestMethod = "GET"
        con.setRequestProperty("Authorization", getAuthString())

        val outFile = File(getDeviceDir(), id)

        Log.i(TAG, "url: $url")
        Log.i(TAG, "outFile: ${outFile.absolutePath}")
        val input = con.inputStream
        val output = FileOutputStream(outFile)
        input.use { _ ->
            output.use { _ ->
                input.copyTo(output)
            }
        }
        Log.i(TAG, "finished")
    }

    private fun getDeviceDir(): File {
        return File("${Environment.getExternalStorageDirectory()}/cacophony-sidekick/$name")
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

    fun testConnection(timeout: Int) : Boolean {
        var result = false
        try {
            result = InetAddress.getByName(hostname).isReachable(timeout)
        } catch (e :IOException) {
            Log.e(TAG, "Error in testing device connection: $e")
        }
        return result
    }
}

data class HttpResponse (val connection : HttpURLConnection, val responseString : String)