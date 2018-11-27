package nz.org.cacophony.sidekick

import android.content.Intent
import android.support.v7.app.AppCompatActivity
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.EditText
import android.widget.Toast
import java.lang.Exception
import java.net.UnknownHostException
import kotlin.concurrent.thread

class LoginScreen : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login_screen)
        val apiUrlEditText = findViewById<EditText>(R.id.api_url_input)
        apiUrlEditText.setText(CacophonyAPI.getServerURL(applicationContext))
        if (CacophonyAPI.getNameOrEmail(applicationContext) != "") {
            gotoMainActivity()
        }
    }

    fun login(v : View) {
        thread(start = true) {
            val nameOrEmailEditText = findViewById<EditText>(R.id.username_email_login)
            val passwordEditText = findViewById<EditText>(R.id.password_login)
            val apiUrlEditText = findViewById<EditText>(R.id.api_url_input)
            try {
                CacophonyAPI.login(applicationContext, nameOrEmailEditText.text.toString(), passwordEditText.text.toString(), apiUrlEditText.text.toString())
                gotoMainActivity()
                nameOrEmailEditText.post {
                    nameOrEmailEditText.text.clear()
                }
            } catch (e : Exception) {
                Log.e(TAG, e.toString())
                var errorMessage = ""
                when(e) {
                    is UnknownHostException -> {
                        errorMessage = "Unknown host: ${apiUrlEditText.text}"
                    }
                    else -> {
                        if (e.message ==  null) {
                            errorMessage = "Unknown error with login"
                        } else {
                            errorMessage = e.message!!
                        }
                    }
                }
                runOnUiThread {
                    Toast.makeText(applicationContext, errorMessage, Toast.LENGTH_LONG).show()
                }
            }
            passwordEditText.post {
                passwordEditText.text.clear()
            }
        }
    }

    private fun gotoMainActivity() {
        val intent = Intent(this, MainActivity::class.java)
        startActivity(intent)
    }
}
