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


class CacophonyAPI(context :Context) {

    companion object {
        private const val DEFAULT_API_SERVER :String = "https://api.cacophony.org.nz"

        private var passwordKey :String = "PASSWORD"
        private var nameOrEmailKey :String = "USERNAME"
        private var serverURLKey :String = "SERVER_URL"
        private var jwtKey :String = "JWT"


        fun login(c :Context, nameOrEmail: String, password: String, serverURL: String) {
            val jsonParam = JSONObject()
            jsonParam.put("nameOrEmail", nameOrEmail)
            jsonParam.put("password", password)
            val con = getCon(serverURL, "/authenticate_user")
            con.setRequestProperty("Content-Type", "application/json;charset=UTF-8");
            con.setRequestProperty("Accept", "application/json");
            con.requestMethod = "POST"
            val outputStream = DataOutputStream(con.outputStream);
            outputStream.writeBytes(jsonParam.toString());
            outputStream.flush()
            outputStream.close()
            Log.i(TAG, con.responseCode.toString())
            Log.i(TAG, con.responseMessage)
            when(con.responseCode) {
                401 -> {
                    throw Exception("Invalid password")
                }
                422 -> {
                    val serverAnswer = BufferedReader(InputStreamReader(con.errorStream))
                    val response = JSONObject(serverAnswer.readLine())
                    serverAnswer.close()
                    throw Exception(response.getString("message"))
                }
                200 -> {
                    val serverAnswer = BufferedReader(InputStreamReader(con.inputStream))
                    val response = JSONObject(serverAnswer.readLine())
                    serverAnswer.close()
                    saveJWT(c, response.getString("token"))
                    saveNameOrEmail(c, nameOrEmail)
                    savePassword(c, password)
                    saveServerURL(c, serverURL)
                }
                else -> {
                    Log.i(TAG, con.responseMessage)
                    throw Exception("Unknown error with connecting to server.")
                }
            }
        }

        fun logout(c: Context) {
            saveJWT(c, "")
            saveNameOrEmail(c, "")
            savePassword(c, "")
            saveServerURL(c, "")
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

                Log.i(TAG, "SERVER REPLIED:");
                Log.i(TAG, responseString)

            } catch (e: Exception) {
                Log.e(TAG, e.toString())
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
            return getPrefs(c).getString(serverURLKey, DEFAULT_API_SERVER)
        }

        fun saveServerURL(c :Context, serverURL: String){
            getPrefs(c).edit().putString(serverURLKey, serverURL).apply()
        }

        fun getPrefs(c: Context): SharedPreferences {
            return c.getSharedPreferences("USER_API", Context.MODE_PRIVATE)
        }


    }
}