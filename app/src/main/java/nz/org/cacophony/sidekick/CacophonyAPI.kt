package nz.org.cacophony.sidekick

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import okhttp3.*
import org.json.JSONException
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import okhttp3.HttpUrl




class CacophonyAPI(@Suppress("UNUSED_PARAMETER") context :Context) {

    companion object {
        private const val DEFAULT_API_SERVER :String = "https://api.cacophony.org.nz"

        private var passwordKey :String = "PASSWORD"
        private var nameOrEmailKey :String = "USERNAME"
        private var serverURLKey :String = "SERVER_URL"
        private var jwtKey :String = "JWT"
        private var groupListKey = "GROUPS"
        private val client :OkHttpClient = OkHttpClient()

        fun login(c :Context, nameOrEmail: String, password: String, serverURL: String) {
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
                } catch (e : JSONException) {
                    Log.i(TAG, "failed to parse to JSON: $responseBody")
                    throw Exception("Failed to parse response from server.")
                }
            }

            when(response.code()) {
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

        private fun getCon(domain: String, path: String): HttpURLConnection {
            val url = URL(domain + path)
            if (url.protocol !in arrayOf("http", "https")) {
                throw IllegalArgumentException("unsupported protocol");
            }
            return url.openConnection() as HttpURLConnection
        }


        fun uploadRecording(c: Context, recording: Recording) {
            val data = JSONObject()
            data.put("type", "thermalRaw")
            data.put("duration", 321) //TODO remove this when server can get the duration from the file
            val recordingFile = File(recording.recordingPath)

            val formBody = MultipartBody.Builder()
                    .setType(MultipartBody.FORM)
                    .addFormDataPart("file", recording.name, RequestBody.create(MediaType.parse("text/plain"), recordingFile))
                    .addFormDataPart("data", data.toString())
                    .build()

            var endpoint="";
            if (recording.deviceID > 0) {
                endpoint = "device/${recording.deviceID}"
            } else {
                endpoint = "device/${recording.deviceName}/group/${recording.groupName}"
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
                } catch (e : JSONException) {
                    Log.i(TAG, "failed to parse to JSON: $responseBody")
                    throw Exception("Failed to parse response from server.")
                }
            }

            when(response.code()) {
                422 -> throw Exception(responseBodyJSON.getString("message"))
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
                } catch (e : JSONException) {
                    Log.i(TAG, "failed to parse to JSON: $responseBody")
                    throw Exception("Failed to parse response from server.")
                }
            }

            when(response.code()) {
                422 -> throw Exception(responseBodyJSON.getString("message"))
                200 -> {
                    val groupSet = mutableSetOf<String>()
                    val groups = responseBodyJSON.getJSONArray("groups")
                    for (i in 0..(groups.length() - 1)) {
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

        fun getGroupList(c: Context): MutableSet<String> {
            return getPrefs(c).getStringSet(groupListKey, mutableSetOf<String>())
        }

        fun saveUserData(c: Context, jwt: String, password: String, nameOrEmail: String, serverURL: String) {
            val prefs = getPrefs(c)
            prefs.edit().putString(nameOrEmailKey, nameOrEmail).apply()
            prefs.edit().putString(passwordKey, password).apply()
            prefs.edit().putString(jwtKey, jwt).apply()
            prefs.edit().putString(serverURLKey, serverURL).apply()
        }

        fun getNameOrEmail(c: Context) :String {
            return getPrefs(c).getString(nameOrEmailKey, "")
        }

        fun getPassword(c: Context) : String {
            return getPrefs(c).getString(passwordKey, "")
        }

        fun getJWT(c: Context) : String {
            return getPrefs(c).getString(jwtKey, "")
        }

        fun getServerURL(c :Context) : String {
            val serverURL = getPrefs(c).getString(serverURLKey, DEFAULT_API_SERVER)
            if (serverURL == "") {
                return DEFAULT_API_SERVER
            }
            return serverURL
        }

        fun getPrefs(c: Context): SharedPreferences {
            return c.getSharedPreferences("USER_API", Context.MODE_PRIVATE)
        }
    }
}
