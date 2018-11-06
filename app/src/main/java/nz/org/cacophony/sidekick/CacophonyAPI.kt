package nz.org.cacophony.sidekick

import android.util.Log
import java.io.BufferedReader
import java.io.DataOutputStream
import java.io.InputStreamReader
import java.lang.Exception
import java.net.HttpURLConnection
import java.net.URL
import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject
import java.io.File
import okhttp3.*
import org.json.JSONException


class CacophonyAPI(context :Context) {

    companion object {
        private const val DEFAULT_API_SERVER :String = "https://api.cacophony.org.nz"

        private var passwordKey :String = "PASSWORD"
        private var nameOrEmailKey :String = "USERNAME"
        private var serverURLKey :String = "SERVER_URL"
        private var jwtKey :String = "JWT"
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
                401 -> {
                    throw Exception("Invalid password")
                }
                422 -> {
                    throw Exception(responseBodyJSON.getString("message"))
                }
                200 -> {
                    saveJWT(c, responseBodyJSON.getString("token"))
                    saveNameOrEmail(c, nameOrEmail)
                    savePassword(c, password)
                    saveServerURL(c, serverURL)
                }
                else -> {
                    Log.i(TAG, "Code: ${response.code()}, body: $responseBody")
                    throw Exception("Unknown error with connecting to server.")
                }
            }
        }

        fun logout(c: Context) {
            saveJWT(c, "")
            saveNameOrEmail(c, "")
            savePassword(c, "")
        }

        private fun getCon(domain: String, path: String): HttpURLConnection {
            val url = URL(domain + path)
            if (url.protocol !in arrayOf("http", "https")) {
                throw IllegalArgumentException("unsupported protocol");
            }
            return url.openConnection() as HttpURLConnection
        }

        fun uploadRecording(c: Context, recording: Recording) : Boolean {
            //TODO Let the errors bubble up to the user
            val data = JSONObject()
            data.put("type", "thermalRaw")
            data.put("duration", 321) //TODO remove this when server can get the duration from the file
            try {
                val con = getCon(getServerURL(c), "/api/v1/recordings/${recording.deviceName}")
                val multipart = MultipartUtility(con, "UTF-8", getJWT(c))
                multipart.addFormField("data", data.toString())
                multipart.addFilePart("file", File(recording.recordingPath))

                val responseStringList = multipart.finish()

                var responseString = ""
                for (line in responseStringList) {
                    Log.i(TAG, "line: $line")
                    responseString += line
                }
                return true
            } catch (e: Exception) {
                Log.e(TAG, e.toString())
                return false
            }
        }

        fun getNameOrEmail(c: Context) :String {
            return getPrefs(c).getString(nameOrEmailKey, "")
        }

        fun saveNameOrEmail(c: Context, nameOrEmail: String) {
            getPrefs(c).edit().putString(nameOrEmailKey, nameOrEmail).apply()
        }

        fun getPassword(c: Context) : String {
            return getPrefs(c).getString(passwordKey, "")
        }

        fun savePassword(c: Context, password: String) {
            getPrefs(c).edit().putString(passwordKey, password).apply()
        }

        fun getJWT(c: Context) : String {
            return getPrefs(c).getString(jwtKey, "")
        }

        fun saveJWT(c: Context, jwt: String) {
            getPrefs(c).edit().putString(jwtKey, jwt).apply()
        }

        fun getServerURL(c :Context) : String {
            val serverURL = getPrefs(c).getString(serverURLKey, DEFAULT_API_SERVER)
            if (serverURL == "") {
                return DEFAULT_API_SERVER
            }
            return serverURL
        }

        fun saveServerURL(c :Context, serverURL: String){
            getPrefs(c).edit().putString(serverURLKey, serverURL).apply()
        }

        fun getPrefs(c: Context): SharedPreferences {
            return c.getSharedPreferences("USER_API", Context.MODE_PRIVATE)
        }


    }
}