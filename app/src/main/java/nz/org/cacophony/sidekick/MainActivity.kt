package nz.org.cacophony.sidekick

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentSender
import android.location.Location
import android.os.Bundle
import android.os.Looper
import android.os.PowerManager
import android.util.Log
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
import com.google.android.gms.common.api.ResolvableApiException
import com.google.android.gms.location.*
import com.google.android.gms.tasks.Task
import com.google.android.material.navigation.NavigationView
import nz.org.cacophony.sidekick.fragments.DevicesFragment
import nz.org.cacophony.sidekick.fragments.HomeFragment
import nz.org.cacophony.sidekick.fragments.RecordingsFragment
import nz.org.cacophony.sidekick.fragments.SettingsFragment
import java.io.File
import kotlin.concurrent.thread

const val TAG = "cacophony-manager"
const val LOCATION_MAX_ATTEMPTS = 5

class Main2Activity : AppCompatActivity() {

    private lateinit var appBarConfiguration: AppBarConfiguration
    private lateinit var navView: NavigationView
    private lateinit var toolbar: Toolbar
    private lateinit var drawerLayout: DrawerLayout
    private lateinit var mainViewModel: MainViewModel
    private lateinit var messenger: Messenger
    private lateinit var permissionHelper: PermissionHelper
    @Volatile var bestLocation: Location? = null
    private val locationSettingsUpdateCode = 5
    @Volatile var locationCount = 0

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
        permissionHelper = PermissionHelper(applicationContext)
        permissionHelper.checkAll(this)

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

    @Suppress("UNUSED_PARAMETER")
    fun uploadRecordings(v: View) {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        val mWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "sidekick:uploading_recordings")
        mWakeLock.acquire(5 * 60 * 1000)
        if (mainViewModel.uploadingRecordings.value!!) {
            return
        }
        mainViewModel.uploadingRecordings.value = true

        thread {
            val recordingsToUpload = mainViewModel.recordingDao.value!!.recordingsToUpload
            runOnUiThread {
                mainViewModel.recordingUploadingCount.value = recordingsToUpload.size
                mainViewModel.recordingUploadingProgress.value = 0
            }
            var allUploaded = true
            for (rec in recordingsToUpload) {
                runOnUiThread {
                    mainViewModel.recordingUploadingProgress.value = mainViewModel.recordingUploadingProgress.value!! + 1
                }
                try {
                    CacophonyAPI.uploadRecording(applicationContext, rec)
                    mainViewModel.recordingDao.value!!.setAsUploaded(rec.id)
                    File(rec.recordingPath).delete()
                } catch (e: Exception) {
                    allUploaded = false
                    if (e.message == null) {
                        messenger.toast("Unknown error with uploading recordings")
                    } else {
                        messenger.toast(e.message!!)
                    }
                }
            }
            if (recordingsToUpload.size == 0) {
                messenger.alert("No recordings to upload")
            } else if (allUploaded) {
                messenger.alert("Finished uploading recordings")
            } else {
                messenger.alert("Failed to upload some or all recordings")
            }
            runOnUiThread {
                mainViewModel.uploadingRecordings.value = false
            }
            mWakeLock.release()
        }
    }

    @Suppress("UNUSED_PARAMETER")
    fun setLocationButton(item: MenuItem) {
        setDevicesLocation(true)
    }

    private fun setDevicesLocation(requestUpdate: Boolean) {
        if (!permissionHelper.check(Manifest.permission.ACCESS_FINE_LOCATION)) {
            if (requestUpdate) {
                permissionHelper.request(this, Manifest.permission.ACCESS_FINE_LOCATION, permissionHelper.locationUpdate)
            }
            return
        }
        mainViewModel.locationStatusText.value = "Getting location"
        createLocationRequest()
    }

    private fun createLocationRequest() {
        val locationRequest = LocationRequest.create().apply {
            interval = 3000
            fastestInterval = 1000
            maxWaitTime = 5000
            priority = LocationRequest.PRIORITY_HIGH_ACCURACY
            numUpdates = LOCATION_MAX_ATTEMPTS
        }

        val builder = LocationSettingsRequest.Builder().addLocationRequest(locationRequest)
        val client: SettingsClient = LocationServices.getSettingsClient(this)
        val task: Task<LocationSettingsResponse> = client.checkLocationSettings(builder.build())

        task.addOnSuccessListener {
            Log.i(TAG, "Have required location settings")
            val fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
            try {
                bestLocation = null
                locationCount = 0
                fusedLocationClient.requestLocationUpdates(locationRequest, makeLocationCallback(fusedLocationClient), Looper.getMainLooper())
            } catch (e: SecurityException) {
                Log.e(TAG, e.toString())
                messenger.alert("Failed to request location updates")
                resetUpdateLocationButton()
            }
        }

        task.addOnFailureListener { e ->
            Log.i(TAG, "Don't have required location settings.")
            if (e is ResolvableApiException) {
                try {
                    Log.i(TAG, "Requesting location settings to be updated")
                    e.startResolutionForResult(this, locationSettingsUpdateCode)
                } catch (sendEx: IntentSender.SendIntentException) {
                    Log.e(TAG, e.toString())
                    resetUpdateLocationButton()
                }
            } else {
                Log.e(TAG, e.toString())
                resetUpdateLocationButton()
            }
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        when (requestCode) {
            locationSettingsUpdateCode -> {
                if (resultCode == -1) {
                    createLocationRequest()
                } else {
                    messenger.alert("Don't have proper location settings to get location.")
                    resetUpdateLocationButton()
                }
            }
        }
    }

    private fun makeLocationCallback(lc: FusedLocationProviderClient): LocationCallback {
        return object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                locationCount++
                val location = locationResult.lastLocation
                Log.i(TAG, "lat ${location.latitude}, " +
                        "long: ${location.longitude}, " +
                        "alt: ${location.altitude}, " +
                        "acc: ${location.accuracy}, " +
                        "time: ${location.time}")

                if (location.accuracy >= 100 || location.latitude == 0.0 && location.longitude == 0.0) {
                    Log.d(TAG, "location not accurate enough or invalid")
                } else if (bestLocation == null || location.accuracy < bestLocation!!.accuracy) {
                    bestLocation = location
                }

                if (bestLocation != null && (bestLocation!!.accuracy < 20 || locationCount == LOCATION_MAX_ATTEMPTS)) {
                    lc.removeLocationUpdates(this)
                    updateDevicesLocation(bestLocation!!)
                } else if (locationCount == LOCATION_MAX_ATTEMPTS) {
                    lc.removeLocationUpdates(this)
                    messenger.alert("Failed to find a location")
                    resetUpdateLocationButton()
                }
            }
        }
    }

    fun updateDevicesLocation(location: Location) {
        mainViewModel.locationStatusText.value = "Updating location for nearby devices"
        thread(start = true) {
            for ((_, device) in mainViewModel.deviceList.value!!.getMap()) {
                if (!device.updateLocation(location)) {
                    messenger.alert("Failed to update location on '${device.name}'")
                }
            }
            messenger.alert("Finished updating location for devices with an accuracy of ${location.accuracy}")
            resetUpdateLocationButton()
        }
    }

    fun resetUpdateLocationButton() {
        runOnUiThread {
            mainViewModel.locationStatusText.value = ""
        }

    }
}
