package nz.org.cacophony.sidekick

import android.content.Intent
import android.os.Bundle
import android.view.MenuItem
import android.view.View
import android.widget.Button
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.Toolbar
import androidx.drawerlayout.widget.DrawerLayout
import androidx.fragment.app.Fragment
import androidx.lifecycle.Observer
import androidx.lifecycle.ViewModelProviders
import androidx.navigation.findNavController
import androidx.navigation.ui.AppBarConfiguration
import androidx.navigation.ui.navigateUp
import androidx.navigation.ui.setupActionBarWithNavController
import com.google.android.material.navigation.NavigationView
import nz.org.cacophony.sidekick.fragments.DevicesFragment
import nz.org.cacophony.sidekick.fragments.HomeFragment
import nz.org.cacophony.sidekick.fragments.RecordingsFragment
import nz.org.cacophony.sidekick.fragments.SettingsFragment
import kotlin.concurrent.thread

class Main2Activity : AppCompatActivity() {

    private lateinit var appBarConfiguration: AppBarConfiguration
    private lateinit var navView: NavigationView
    private lateinit var toolbar: Toolbar
    private lateinit var drawerLayout: DrawerLayout
    private lateinit var mainViewModel: MainViewModel
    private lateinit var networkChangeReceiver: MainActivity.NetworkChangeReceiver
    private lateinit var messenger: Messenger

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main2)

        drawerLayout = findViewById(R.id.drawer_layout)
        navView = findViewById(R.id.nav_view)
        toolbar = findViewById(R.id.toolbar)
        setSupportActionBar(toolbar)

        mainViewModel = ViewModelProviders.of(this)[MainViewModel::class.java]
        mainViewModel.init(this)
        messenger = mainViewModel.messenger.value!!
        setViewModelObserves()

        setUpNavigationView()
    }

    private fun setViewModelObserves() {
        // Update toolbar title
        mainViewModel.title.observe(this, Observer {
            toolbar.title = it
        })
    }

    override fun onDestroy() {
        mainViewModel.discovery.value!!.stop()
        unregisterReceiver(networkChangeReceiver)
        super.onDestroy()
    }

    override fun onSupportNavigateUp(): Boolean {
        val navController = findNavController(R.id.nav_host_fragment)
        return navController.navigateUp(appBarConfiguration) || super.onSupportNavigateUp()
    }

    @Suppress("UNUSED_PARAMETER")
    fun openDevicesFragment(v: View) {
        loadFragment(DevicesFragment())
    }

    @Suppress("UNUSED_PARAMETER")
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
                return true
            }
        })
    }

    @Suppress("UNUSED_PARAMETER")
    fun enableValidAp(v: View) {
        val wifiHelper = WifiHelper(applicationContext)
        messenger.toast("Turning on hotspot")
        if (wifiHelper.enableValidAp()) {
            messenger.toast("Hotspot turned on")
        } else {
            messenger.alert("Failed to turn on hotspot")
        }
    }

    @Suppress("UNUSED_PARAMETER")
    fun openNetworkSettings(v: View) {
        val intent = Intent()
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        intent.action = android.provider.Settings.ACTION_WIRELESS_SETTINGS
        startActivity(intent)
    }

    @Suppress("UNUSED_PARAMETER")
    fun downloadAll(v: View) {
        val downloadButton = findViewById<Button>(R.id.download_recordings_button)
        downloadButton.isClickable = false
        downloadButton.alpha = .5f
        downloadButton.text = "GETTING RECORDINGS"
        for ((_, device) in mainViewModel.deviceList.value!!.getMap()) {
            thread {
                device.startDownloadRecordings()
                if (!mainViewModel.deviceList.value!!.downloading()) {
                    runOnUiThread {
                        downloadButton.isClickable = true
                        downloadButton.alpha = 1f
                        downloadButton.text = "GET RECORDINGS"
                    }
                }
            }
        }
    }
}
