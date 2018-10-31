package nz.org.cacophony.sidekick

import android.content.Intent
import android.support.v7.app.AppCompatActivity
import android.os.Bundle
import android.view.View
import android.widget.EditText
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
            val nameOrEmailEditText = v.findViewById<EditText>(R.id.username_email_login)
            val passwordEditText = v.findViewById<EditText>(R.id.password_login)
            val apiUrlEditText = v.findViewById<EditText>(R.id.api_url_input)
            if (CacophonyAPI.newUser(applicationContext, nameOrEmailEditText.text.toString(), passwordEditText.text.toString(), apiUrlEditText.text.toString())) {
                nameOrEmailEditText.post {
                    nameOrEmailEditText.text.clear()
                }
                passwordEditText.post {
                    passwordEditText.text.clear()
                }
                gotoMainActivity()
            }
        }
    }

    private fun gotoMainActivity() {
        val intent = Intent(this, MainActivity::class.java)
        startActivity(intent)
    }
}
