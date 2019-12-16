package nz.org.cacophony.sidekick

import android.content.Intent
import android.os.Bundle
import android.view.MenuItem
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.Toolbar
import androidx.drawerlayout.widget.DrawerLayout
import androidx.fragment.app.Fragment
import androidx.navigation.findNavController
import androidx.navigation.ui.AppBarConfiguration
import androidx.navigation.ui.navigateUp
import androidx.navigation.ui.setupActionBarWithNavController
import com.google.android.material.navigation.NavigationView
import nz.org.cacophony.sidekick.ui.devices.DevicesFragment
import nz.org.cacophony.sidekick.ui.home.HomeFragment
import nz.org.cacophony.sidekick.ui.recordings.RecordingsFragment
import nz.org.cacophony.sidekick.ui.settings.SettingsFragment

class Main2Activity : AppCompatActivity() {

    private lateinit var appBarConfiguration: AppBarConfiguration
    private lateinit var navView: NavigationView
    private lateinit var toolbar: Toolbar
    private lateinit var drawerLayout: DrawerLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main2)

        drawerLayout = findViewById(R.id.drawer_layout)
        navView = findViewById(R.id.nav_view)
        toolbar = findViewById(R.id.toolbar)
        setSupportActionBar(toolbar)

        setUpNavigationView()
    }

    override fun onSupportNavigateUp(): Boolean {
        val navController = findNavController(R.id.nav_host_fragment)
        return navController.navigateUp(appBarConfiguration) || super.onSupportNavigateUp()
    }

    fun openDevicesFragment(v: View) {
        loadFragment(DevicesFragment())
    }

    fun openRecordingsFragment(v: View) {
        loadFragment(RecordingsFragment())
    }

    override fun onBackPressed() {
        loadFragment(HomeFragment())
    }

    @Suppress("UNUSED_PARAMETER")
    fun logout(v: View) {
        CacophonyAPI.logout(applicationContext)
        val intent = Intent(applicationContext, LoginScreen::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_CLEAR_TOP
        startActivity(intent)
        finish()
    }

    fun loadFragment(f: Fragment) {
        val ft = supportFragmentManager.beginTransaction()
        ft.replace(R.id.nav_host_fragment, f)
        ft.commit()
        drawerLayout.closeDrawers()
    }


    private fun setUpNavigationView() {
        val navController = findNavController(R.id.nav_host_fragment)
        appBarConfiguration = AppBarConfiguration(setOf(
                R.id.nav_home, R.id.nav_devices, R.id.nav_recordings), drawerLayout)
        setupActionBarWithNavController(navController, appBarConfiguration)

        navView.setNavigationItemSelectedListener(object : NavigationView.OnNavigationItemSelectedListener {

            override fun onNavigationItemSelected(menuItem: MenuItem): Boolean {

                when (menuItem.itemId) {
                    R.id.nav_home -> {
                        loadFragment(HomeFragment())
                    }
                    R.id.nav_devices -> {
                        loadFragment(DevicesFragment())
                    }
                    R.id.nav_settings -> {
                        loadFragment(SettingsFragment())
                    }
                    R.id.nav_recordings -> {
                        loadFragment(RecordingsFragment())
                    }
                }
                toolbar.title = "$menuItem"
                return true
            }
        })
    }
}
