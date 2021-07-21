package nz.org.cacophony.sidekick

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import com.google.firebase.crashlytics.FirebaseCrashlytics
import nz.org.cacophony.sidekick.db.Recording
import okhttp3.*
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.io.File
import java.math.BigInteger
import java.security.MessageDigest

class ForbiddenUploadException: Exception("Invalid permission to upload recording for device")

class CacophonyAPI(@Suppress("UNUSED_PARAMETER") context: Context) {

    companion object {
        private const val DEFAULT_API_SERVER: String = "https://api.cacophony.org.nz"

        private var passwordKey: String = "PASSWORD"
        private var nameOrEmailKey: String = "USERNAME"
        private var serverURLKey: String = "SERVER_URL"
        private var jwtKey: String = "JWT"
        private var groupListKey = "GROUPS"
        private val client: OkHttpClient = OkHttpClient()

        fun login(c: Context, nameOrEmail: String, password: String, serverURL: String) {
            val body = FormBody.Builder()
                    .addEncoded("nameOrEmail", nameOrEmail)
                    .addEncoded("password", password)
                    .build()

            val request = Request.Builder()
                    .url("$serverURL/authenticate_user")
                    .post(body)
                    .build()

            val response = client.newCall(request).execute()
            var responseBody = ""
            var responseBodyJSON = JSONObject()
            if (response.body() != null) {
                try {
                    responseBody = (response.body() as ResponseBody).string()  //This also closes the body
                    responseBodyJSON = JSONObject(responseBody)
                } catch (e: JSONException) {
                    Log.i(TAG, "failed to parse to JSON: $responseBody")
                    throw Exception("Failed to parse response from server.")
                }
            }

            when (response.code()) {
                401 -> throw Exception("Invalid password")
                422 -> throw Exception(responseBodyJSON.getString("message"))
                200 -> saveUserData(c, responseBodyJSON.getString("token"), password, nameOrEmail, serverURL)
                else -> {
                    Log.i(TAG, "Code: ${response.code()}, body: $responseBody")
                    throw Exception("Unknown error with connecting to server.")
                }
            }
        }

        fun logout(c: Context) {
            saveUserData(c, "", "", "", "")
        }

        fun uploadRecording(c: Context, recording: Recording) {
            val data = JSONObject()
            data.put("type", "thermalRaw")
            val recordingFile = File(recording.recordingPath)
            val md = MessageDigest.getInstance("SHA-1").digest(recordingFile.readBytes())
            val no = BigInteger(1, md)
            val fileHash = no.toString(16).padStart(40, '0')
            data.put("fileHash", fileHash)

            val formBody = MultipartBody.Builder()
                    .setType(MultipartBody.FORM)
                    .addFormDataPart("file", recording.name, RequestBody.create(MediaType.parse("text/plain"), recordingFile))
                    .addFormDataPart("data", data.toString())
                    .build()

            var endpoint: String
            if (recording.deviceID > 0) {
                endpoint = "device/${recording.deviceID}"
            } else {
                endpoint = "device/${recording.deviceName}"
                if (recording.groupName != null && recording.groupName != "") {
                    endpoint += "/group/${recording.groupName}"
                }
            }
            val request = Request.Builder()
                    .url("${getServerURL(c)}/api/v1/recordings/${endpoint}")
                    .addHeader("Authorization", getJWT(c))
                    .post(formBody)
                    .build()

            val response = client.newCall(request).execute()
            var responseBody = ""
            var responseBodyJSON = JSONObject()
            if (response.body() != null) {
                try {
                    responseBody = (response.body() as ResponseBody).string()  //This also closes the body
                    responseBodyJSON = JSONObject(responseBody)
                } catch (e: JSONException) {
                    Log.i(TAG, "failed to parse to JSON: $responseBody")
                    throw Exception("Failed to parse response from server.")
                }
            }

            when (response.code()) {
                422 -> throw Exception(responseBodyJSON.getString("message"))
                403 -> throw ForbiddenUploadException()
                200 -> return
                else -> {
                    Log.i(TAG, "Code: ${response.code()}, body: $responseBody")
                    throw Exception("Unknown error with connecting to server.")
                }
            }
        }

        fun uploadEvents(c: Context, deviceID: Int, timestamps: Array<String>, type: String, details: String) {
            val description = JSONObject()
            description.put("type", type)
            description.put("details", JSONObject(details))
            val t = JSONArray(timestamps)
            val data = JSONObject()
            data.put("description", description)
            data.put("dateTimes", t)

            val urlStr = "${getServerURL(c)}/api/v1/events/device/${deviceID}"
            val url = HttpUrl.parse(urlStr) ?: throw Exception("unable to parse url: '$urlStr'")

            val requestBody = RequestBody.create(
                    MediaType.parse("application/json; charset=utf-8"),
                    data.toString().toByteArray(Charsets.UTF_8))

            val request = Request.Builder()
                    .url(url)
                    .addHeader("Content-Type", "application/json")
                    .addHeader("Authorization", getJWT(c))
                    .post(requestBody)
                    .build()


            val response = client.newCall(request).execute()
            var responseBody = ""
            var responseBodyJSON = JSONObject()
            if (response.body() != null) {
                try {
                    responseBody = (response.body() as ResponseBody).string()  //This also closes the body
                    responseBodyJSON = JSONObject(responseBody)
                } catch (e: JSONException) {
                    Log.i(TAG, "failed to parse to JSON: $responseBody")
                    throw Exception("Failed to parse response from server.")
                }
            }
            when (response.code()) {
                422 -> throw Exception(responseBodyJSON.getString("message"))
                403 -> throw ForbiddenUploadException()
                200 -> return
                else -> {
                    Log.i(TAG, "Code: ${response.code()}, body: $responseBody")
                    throw Exception("Unknown error with connecting to server.")
                }
            }
        }

        fun updateGroupList(c: Context) {
            val httpBuilder = HttpUrl.parse("${getServerURL(c)}/api/v1/groups")!!.newBuilder()

            httpBuilder.addQueryParameter("where", "{}")
            val request = Request.Builder()
                    .url(httpBuilder.build())
                    .addHeader("Authorization", getJWT(c))
                    .build()

            val response = client.newCall(request).execute()
            var responseBody = ""
            var responseBodyJSON = JSONObject()
            if (response.body() != null) {
                try {
                    responseBody = (response.body() as ResponseBody).string()  //This also closes the body
                    responseBodyJSON = JSONObject(responseBody)
                } catch (e: JSONException) {
                    Log.i(TAG, "failed to parse to JSON: $responseBody")
                    throw Exception("Failed to parse response from server.")
                }
            }

            when (response.code()) {
                422 -> throw Exception(responseBodyJSON.getString("message"))
                200 -> {
                    val groupSet = mutableSetOf<String>()
                    val groups = responseBodyJSON.getJSONArray("groups")
                    for (i in 0 until groups.length()) {
                        groupSet.add(groups.getJSONObject(i).getString("groupname"))
                    }
                    Log.i(TAG, groupSet.toString())
                    getPrefs(c).edit().putStringSet(groupListKey, groupSet).apply()
                }
                else -> {
                    Log.i(TAG, "Code: ${response.code()}, body: $responseBody")
                    throw Exception("Unknown error with connecting to server.")
                }
            }
        }

        fun getGroupList(c: Context): List<String>? {
            return getPrefs(c).getStringSet(groupListKey, mutableSetOf<String>())?.sorted()
        }

        private fun saveUserData(c: Context, jwt: String, password: String, nameOrEmail: String, serverURL: String) {
            val prefs = getPrefs(c)
            prefs.edit().putString(nameOrEmailKey, nameOrEmail).apply()
            prefs.edit().putString(passwordKey, password).apply()
            prefs.edit().putString(jwtKey, jwt).apply()
            prefs.edit().putString(serverURLKey, serverURL).apply()
            val crashlytics = FirebaseCrashlytics.getInstance()
            crashlytics.setUserId(nameOrEmail)
        }

        fun getNameOrEmail(c: Context): String? {
            return getPrefs(c).getString(nameOrEmailKey, "")
        }

        private fun getJWT(c: Context): String {
            return getPrefs(c).getString(jwtKey, "") ?: ""
        }

        fun getServerURL(c: Context): String {
            val serverURL = getPrefs(c).getString(serverURLKey, DEFAULT_API_SERVER)
            if (serverURL == "" || serverURL == null) {
                return DEFAULT_API_SERVER
            }
            return serverURL
        }

        private fun getPrefs(c: Context): SharedPreferences {
            return c.getSharedPreferences("USER_API", Context.MODE_PRIVATE)
        }
    }
}
