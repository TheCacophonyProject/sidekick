package nz.org.cacophony.sidekick

import android.location.Location
import okhttp3.*
import okio.Okio
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.URL

class DeviceAPI(
        private val hostname: String,
        private val port: Int
) {

    private val client = OkHttpClient()

    fun getDeviceInfo(): JSONObject {
        val url = getUrl("/api/device-info")
        val request = getAuthReq(url)
        val response = client.newCall(request).execute()
        return JSONObject(getResponseBody(response).string())
    }

    fun getDeviceVersion(): JSONObject {
        val url = getUrl("/api/version")
        val request = getAuthReq(url)
        val response = client.newCall(request).execute()
        return JSONObject(getResponseBody(response).string())
    }

    fun getRecordingList(): JSONArray {
        val url = getUrl("/api/recordings")
        val request = getAuthReq(url)
        val response = client.newCall(request).execute()
        return JSONArray(getResponseBody(response).string())
    }

    fun downloadRecording(name: String, file: File) {
        val url = getUrl("/api/recording/$name")
        val request = getAuthReq(url)
        val response = client.newCall(request).execute()
        val sink = Okio.buffer(Okio.sink(file))
        sink.writeAll(getResponseBody(response).source())
        sink.close()
        response.close()
    }

    fun deleteRecording(name: String) {
        val url = getUrl("/api/recording/$name")
        val request = getAuthReq(url)
                .newBuilder()
                .delete()
                .build()
        val response = client.newCall(request).execute()
        if (!response.isSuccessful) {
            throw Exception("failed to delete $name from device")
        }
    }

    fun getEventKeys(): JSONArray {
        val request = getAuthReq(getUrl("/api/event-keys"))
        val response = client.newCall(request).execute()
        return JSONArray(getResponseBody(response).string())
    }

    fun downloadEvents(eventKeys: Array<Int>): JSONObject {
        val url = getUrl("/api/events").newBuilder()
                .addQueryParameter("keys", "[${eventKeys.joinToString(", ")}]")
                .build()
        val request = getAuthReq(url)
        val response = client.newCall(request).execute()
        return JSONObject(getResponseBody(response).string())
    }

    fun deleteEvents(events: Array<Int>) {
        val url = getUrl("/api/events")
                .newBuilder()
                .addQueryParameter("keys", "[${events.joinToString(", ")}]")
                .build()
        val request = getAuthReq(url)
                .newBuilder()
                .delete()
                .build()
        val response = client.newCall(request).execute()
        if (!response.isSuccessful) {
            throw Exception("failed to delete events from device")
        }
    }

    fun setLocation(location: Location) {
        val url = getUrl("/api/location")
        val body = FormBody.Builder()
                .addEncoded("latitude", location.latitude.toString())
                .addEncoded("longitude", location.longitude.toString())
                .addEncoded("timestamp", location.time.toString())
                .addEncoded("altitude", location.altitude.toString())
                .addEncoded("accuracy", location.accuracy.toString())
                .build()
        val request = getAuthReq(url)
                .newBuilder()
                .post(body)
                .build()
        val response = client.newCall(request).execute()
        if (!response.isSuccessful) {
            throw Exception("failed to update location on device")
        }
    }

    private fun getAuthReq(url: HttpUrl): Request {
        //TODO Add better security...
        return Request.Builder()
                .url(url)
                .addHeader("Authorization", "Basic YWRtaW46ZmVhdGhlcnM=")
                .build()
    }

    private fun getResponseBody(response: Response): ResponseBody {
        if (!response.isSuccessful) {
            throw Exception("call failed. Error: ${response.message()}")  // TODO Add more useful info in exception
        }
        return response.body() ?: throw Exception("failed to get body from response")
    }

    private fun getUrl(path: String): HttpUrl {
        val urlStr = URL("http", hostname, port, path).toString()
        return HttpUrl.parse(urlStr) ?: throw Exception("failed to parse URL: $urlStr")
    }
}