package nz.org.cacophony.sidekick

import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Browser
import android.util.Log
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import com.google.firebase.crashlytics.FirebaseCrashlytics
import nz.org.cacophony.sidekick.db.RoomDatabase
import java.net.UnknownHostException
import kotlin.concurrent.thread

class LoginScreen : AppCompatActivity() {

    @Volatile
    var imageClickCountdown = 10 // Number of times the image needs to be pressed for the API url option to show
    private val apiURLs = arrayOf("https://api.cacophony.org.nz", "https://api-test.cacophony.org.nz")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login_screen)
        val username = CacophonyAPI.getNameOrEmail(applicationContext)
        FirebaseCrashlytics.getInstance().setUserId(username ?: "")
        if (username != "") {
            gotoMainActivity()
        }

        val apiUrlEditText = findViewById<AutoCompleteTextView>(R.id.api_url_input)
        apiUrlEditText.setText(CacophonyAPI.getServerURL(applicationContext))
        apiUrlEditText.setOnClickListener { findViewById<AutoCompleteTextView>(R.id.api_url_input).showDropDown() }
        apiUrlEditText.threshold = 0
        apiUrlEditText.setAdapter(ArrayAdapter(this, android.R.layout.simple_dropdown_item_1line, apiURLs))
    }

    @Suppress("UNUSED_PARAMETER")
    fun login(view: View) {
        thread(start = true) {
            val nameOrEmailEditText = findViewById<EditText>(R.id.username_email_login)
            val passwordEditText = findViewById<EditText>(R.id.password_login)
            val apiUrlEditText = findViewById<EditText>(R.id.api_url_input)
            try {
                CacophonyAPI.login(applicationContext, nameOrEmailEditText.text.toString(), passwordEditText.text.toString(), apiUrlEditText.text.toString())
                Preferences(applicationContext).setString(SERVER_URL_KEY, apiUrlEditText.text.toString())
                gotoMainActivity()
                nameOrEmailEditText.post {
                    nameOrEmailEditText.text.clear()
                }
            } catch (e: Exception) {
                Log.e(TAG, e.toString())
                val errorMessage = when (e) {
                    is UnknownHostException -> "Unknown host: ${apiUrlEditText.text}"
                    else -> e.message ?: "Unknown error with login"
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

    @Suppress("UNUSED_PARAMETER")
    fun imageClick(v: View) {
        imageClickCountdown--
        if (imageClickCountdown <= 0) {
            runOnUiThread {
                val dialogBuilder = AlertDialog.Builder(this)
                dialogBuilder
                    .setMessage("Do you wish to change the API? This will delete all recordings and events currently on your phone.")
                    .setCancelable(false)
                    .setNegativeButton("Cancel") { _, _ -> }
                    .setPositiveButton("OK") { _, _ -> showAPIAndDeleteData() }
                val alert = dialogBuilder.create()
                alert.setTitle("Message")
                alert.show()
            }
        }
    }

    private fun showAPIAndDeleteData() {
        findViewById<LinearLayout>(R.id.api_linear_layout).visibility = View.VISIBLE
        thread {
            val database = RoomDatabase.getDatabase(this) ?: throw java.lang.Exception("failed to get database")
            database.clearData()
        }
    }

    @Suppress("UNUSED_PARAMETER")
    fun openRegisterPage(v: View) {
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
