package nz.org.cacophony.sidekick

import android.util.Log
import java.io.BufferedReader
import java.io.DataOutputStream
import java.io.InputStreamReader
import java.lang.Exception
import java.net.HttpURLConnection
import java.net.URL
import javax.net.ssl.HttpsURLConnection
import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject


class CacophonyAPI(context :Context) {

    companion object {
        private var passwordKey :String = "PASSWORD"
        private var nameOrEmailKey :String = "USERNAME"
        private var serverURLKey :String = "SERVER_URL"
        private var jwtKey :String = "JWT"


        fun newUser(c :Context, nameOrEmail: String, password: String, serverURL: String): Boolean {
            val jwt = getNewJWT(c, nameOrEmail, password, serverURL)
            if (jwt != "") {
                saveJWT(c, jwt)
                saveNameOrEmail(c, nameOrEmail)
                savePassword(c, password)
                return true
            }
            return false
        }

        fun login(c :Context) :Boolean {
            val jwt = getNewJWT(c, getNameOrEmail(c), getPassword(c), getServerURL(c))
            if (jwt != "") {
                saveJWT(c, jwt)
                return true
            }
            return false
        }

        fun logout(c: Context) {
            saveJWT(c, "")
            saveNameOrEmail(c, "")
            savePassword(c, "")
            saveServerURL(c, "")
        }

        private fun getNewJWT(c: Context, nameOrEmail: String, password: String, serverURL: String): String {
            try {
                val jsonParam = JSONObject()
                jsonParam.put("nameOrEmail", nameOrEmail)
                jsonParam.put("password", password)
                val con = getCon(serverURL, "/authenticate_user")
                con.setRequestProperty("Content-Type", "application/json;charset=UTF-8");
                con.setRequestProperty("Accept", "application/json");
                con.requestMethod = "POST"
                val os = DataOutputStream(con.outputStream);
                os.writeBytes(jsonParam.toString());
                os.flush()

                val serverAnswer = BufferedReader(InputStreamReader(con.inputStream))
                val response = JSONObject(serverAnswer.readLine())
                os.close()
                serverAnswer.close()
                Log.i(TAG, response.toString())
                if (!response.getBoolean("success")) {
                    return ""
                }
                return response.getString("token")
            } catch (e: Exception) {
                Log.e(TAG, e.toString())
                return ""
            }
        }

        private fun getCon(domain: String, path: String): HttpURLConnection {
            val url = URL(domain + path)
            when (url.protocol) {
                "http" -> {
                    return url.openConnection() as HttpURLConnection
                }
                "https" -> {
                    return url.openConnection() as HttpsURLConnection
                }
                else -> {
                    throw IllegalArgumentException("unsupported protocol");
                }
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
            return getPrefs(c).getString(serverURLKey, "")
        }

        fun saveServerURL(c :Context, serverURL: String){
            getPrefs(c).edit().putString(serverURLKey, serverURL).apply()
        }

        fun getPrefs(c: Context): SharedPreferences {
            return c.getSharedPreferences("USER_API", Context.MODE_PRIVATE)
        }


    }
}