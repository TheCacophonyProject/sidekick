package nz.org.cacophony.sidekick

import android.content.Intent
import android.net.Uri
import android.support.v7.app.AppCompatActivity
import android.os.Bundle
import android.provider.Browser
import android.util.Log
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Toast
import java.lang.Exception
import java.net.UnknownHostException
import kotlin.concurrent.thread
import android.widget.ArrayAdapter
import android.widget.AutoCompleteTextView
import java.net.URL

class LoginScreen : AppCompatActivity() {

    @Volatile var imageClickCountdown = 10 // Number of times the image needs to be pressed for the API url option to show
    private val API_URLS = arrayOf("https://api.cacophony.org.nz", "https://api-test.cacophony.org.nz")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login_screen)
        val apiUrlEditText = findViewById<EditText>(R.id.api_url_input)
        apiUrlEditText.setText(CacophonyAPI.getServerURL(applicationContext))
        if (CacophonyAPI.getNameOrEmail(applicationContext) != "") {
            gotoMainActivity()
        }

        val img = findViewById<AutoCompleteTextView>(R.id.api_url_input)
        img.setOnClickListener(object : View.OnClickListener {
            override fun onClick(v: View) {
                findViewById<AutoCompleteTextView>(R.id.api_url_input).showDropDown()
            }
        })

        val apiAutoComplete = findViewById<AutoCompleteTextView>(R.id.api_url_input)
        apiAutoComplete.threshold = 0
        apiAutoComplete.setAdapter(ArrayAdapter<String>(this, android.R.layout.simple_dropdown_item_1line, API_URLS))
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

    fun imageClick(v : View) {
        imageClickCountdown--
        if (imageClickCountdown <= 0) {
            findViewById<LinearLayout>(R.id.api_linear_layout).visibility = View.VISIBLE
        }
    }

    fun openRegisterPage(v : View) {
        val url = Uri.parse("https://browse.cacophony.org.nz/register")
        val urlIntent = Intent(Intent.ACTION_VIEW, url)
        urlIntent.putExtra(Browser.EXTRA_APPLICATION_ID, "$TAG-register")
        startActivity(urlIntent)
    }

    private fun gotoMainActivity() {
        val intent = Intent(this, MainActivity::class.java)
        startActivity(intent)
    }
}
