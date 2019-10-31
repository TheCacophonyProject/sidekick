package nz.org.cacophony.sidekick

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity


class SettingsActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)
        var tvVersion = findViewById<TextView>(R.id.tvVersion)
        tvVersion.setText("Sidekick v${BuildConfig.VERSION_NAME}")
    }

    @Suppress("UNUSED_PARAMETER")
    fun logout(v: View) {
        CacophonyAPI.logout(applicationContext)
        val intent = Intent(applicationContext, LoginScreen::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_CLEAR_TOP
        startActivity(intent)
        finish()
    }
}
