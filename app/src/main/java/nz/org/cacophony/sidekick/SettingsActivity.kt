package nz.org.cacophony.sidekick

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import android.view.View



class SettingsActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)
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
