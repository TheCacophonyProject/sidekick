package nz.org.cacophony.sidekick

import android.Manifest
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
import androidx.appcompat.app.AlertDialog
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
import nz.org.cacophony.sidekick.db.EventDao
import nz.org.cacophony.sidekick.db.RecordingDao
import nz.org.cacophony.sidekick.fragments.*
import java.io.File
import kotlin.concurrent.thread

const val TAG = "cacophony-manager"
const val LOCATION_MAX_ATTEMPTS = 5

class MainActivity : AppCompatActivity() {

    private lateinit var appBarConfiguration: AppBarConfiguration
    private lateinit var navView: NavigationView
    private lateinit var toolbar: Toolbar
    private lateinit var drawerLayout: DrawerLayout
    private lateinit var mainViewModel: MainViewModel
    private lateinit var messenger: Messenger
    private lateinit var permissionHelper: PermissionHelper
    private lateinit var eventDao: EventDao
    private lateinit var recordingDao: RecordingDao
    private lateinit var locationHelper: LocationHelper
    @Volatile
    var locationCount = 0
    private var versionClickCountdown = 10 // Number of times the image needs to be pressed for the dev fragment will be shown

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        drawerLayout = findViewById(R.id.drawer_layout)
        navView = findViewById(R.id.nav_view)
        toolbar = findViewById(R.id.toolbar)
        setSupportActionBar(toolbar)

        mainViewModel = ViewModelProviders.of(this)[MainViewModel::class.java]
        mainViewModel.init(this)
        messenger = mainViewModel.messenger.value!!
        permissionHelper = PermissionHelper(applicationContext)
        permissionHelper.checkAll(this)

        locationHelper = LocationHelper(permissionHelper, mainViewModel, this)
        eventDao = mainViewModel.db.value!!.eventDao()
        recordingDao = mainViewModel.db.value!!.recordingDao()

        setViewModelObserves()

        setUpNavigationView()
    }

    override fun onResume() {
        super.onResume()
        thread {
            try {
                CacophonyAPI.updateGroupList(this)
                mainViewModel.groups.postValue(CacophonyAPI.getGroupList(this))
            } catch(e: Exception) {
                Log.e(TAG, e.toString())
            }
        }
    }

    private fun setViewModelObserves() {
        // Update toolbar title
        mainViewModel.title.observe(this, {
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

        navView.setNavigationItemSelectedListener { menuItem ->
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
            true
        }
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
        if (!validStorageLocation()) {
            return
        }
        mainViewModel.downloading.value = true
        thread {
            for ((_, device) in mainViewModel.deviceList.value!!.getMap()) {
                try {
                    device.downloadEvents()
                    device.startDownloadRecordings()
                } catch(e: LowStorageSpaceException) {
                    messenger.alert(e.message ?: "Low storage space on phone. Stopping download.")
                    break
                } catch (e: Exception) {
                    messenger.alert(e.message ?: "Error with downloading recordings on ${device.name}")
                }
            }
            runOnUiThread {
                mainViewModel.downloading.value = false
            }
        }
    }

    @Suppress("UNUSED_PARAMETER")
    fun upload(v: View) {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        val mWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "sidekick:uploading_recordings")
        mWakeLock.acquire(5 * 60 * 1000)
        if (mainViewModel.uploading.value == true) {
            return
        }
        mainViewModel.uploading.value = true
        thread {
            uploadEvents()
            uploadRecordings()

            if (mWakeLock.isHeld) {
                mWakeLock.release()
            }
            runOnUiThread {
                mainViewModel.uploading.value = false
            }
        }
    }

    private fun uploadRecordings(maxFailCount: Int = 3): Int {
        val recordingsToUpload = recordingDao.getRecordingsToUpload()
        runOnUiThread {
            mainViewModel.recordingsBeingUploadedCount.value = recordingsToUpload.size
            mainViewModel.recordingUploadingProgress.value = 0
        }
        if (recordingsToUpload.isEmpty()) {
            return 0
        }
        var invalidPermissionFailCount = 0
        var otherFailCount = 0
        for (rec in recordingsToUpload) {
            runOnUiThread {
                mainViewModel.recordingUploadingProgress.value = (mainViewModel.recordingUploadingProgress.value ?: 0) + 1
            }
            try {
                CacophonyAPI.uploadRecording(applicationContext, rec)
                recordingDao.setAsUploaded(rec.id)
                File(rec.recordingPath).delete()
            } catch (e: ForbiddenUploadException) {
                invalidPermissionFailCount++
                messenger.toast(e.message!!)
            } catch (e: Exception) {
                otherFailCount++
                messenger.toast(e.message ?: "Unknown error with uploading recordings")
                if (otherFailCount >= maxFailCount) {
                    messenger.alert("Stopping upload of recordings as too many failed")
                    return otherFailCount
                }
            }
        }
        val totalFailed = otherFailCount + invalidPermissionFailCount
        when (totalFailed) {
            0 ->
                messenger.alert("Finished uploading recordings")
            else -> messenger.alert("Failed to upload $totalFailed recordings, " +
                    "$invalidPermissionFailCount being because of invalid permission")
        }
        return totalFailed
    }

    private fun uploadEvents(maxFailCount: Int = 3): Int {
        val eventsToUpload = eventDao.getEventsToUpload()
        runOnUiThread {
            mainViewModel.eventsBeingUploadedCount.value = eventsToUpload.size
            mainViewModel.eventUploadingProgress.value = 0
        }
        if (eventsToUpload.isEmpty()) {
            messenger.toast("No events to upload")
            return 0
        }
        var otherFailCount = 0
        var invalidPermissionFailCount = 0
        var excludeIDs = emptyList<Int>()
        while (eventDao.getOneNotUploaded(excludeIDs) != null) {
            Log.i(TAG, "uploading some events")
            val event = eventDao.getOneNotUploaded(excludeIDs) ?: break   //If null break from loop
            val events = eventDao.getSimilarToUpload(event.deviceID, event.type, event.details)
            var timestamps = emptyArray<String>()
            for (e in events) {
                excludeIDs = excludeIDs.plus(e.id)
                timestamps = timestamps.plus(e.timestamp)
            }
            try {
                CacophonyAPI.uploadEvents(
                    applicationContext,
                    event.deviceID,
                    timestamps,
                    event.type,
                    event.details
                )
                runOnUiThread {
                    mainViewModel.eventUploadingProgress.value =
                        (mainViewModel.eventUploadingProgress.value ?: 0) + timestamps.size
                }
                for (e in events) {
                    eventDao.setAsUploaded(e.id)
                }
            } catch(e: ForbiddenUploadException) {
                invalidPermissionFailCount++
            } catch(e : Exception) {
                otherFailCount++
                messenger.toast(e.message ?: "Unknown error with uploading events")
                Log.e(TAG, "Error with uploading events $e")
                if (otherFailCount >= maxFailCount) {
                    break
                }
            }
        }
        val totalFailed = otherFailCount + invalidPermissionFailCount
        when (totalFailed) {
            0 ->
                messenger.alert("Finished uploading events")
            else -> messenger.alert("Failed to upload $totalFailed events, " +
                    "$invalidPermissionFailCount being because of invalid permission")
        }
        return totalFailed
    }

    @Suppress("UNUSED_PARAMETER")
    fun setLocationButton(item: MenuItem) {
        locationHelper.setDevicesLocation()
    }


    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        var granted = true
        for (i in grantResults) {
            granted = granted && (i == 0)
        }
        Log.i(TAG, "Permission requestCode: $requestCode, granted: $granted")
        when (requestCode) {
            permissionHelper.locationUpdate -> {
                if (granted) {
                    locationHelper.createLocationRequest()
                } else {
                    messenger.alert("App doesn't have proper permissions to get location.")
                    mainViewModel.locationStatusText.postValue("")
                }
            }
        }
    }

    @Suppress("UNUSED_PARAMETER")
    fun chooseStorageLocation(v: View) {
        val extDirs = getExternalFilesDirs(null)
        val dirs = Array(extDirs.size){""}
        for (i in extDirs.indices) {
            val file = extDirs[i]
            val gbAvailable = Util.fsAvailableMB(file.path) / 1024.toFloat()
            val gbCount = Util.fsSizeMB(file.path) / 1024.toFloat()
            Log.i(TAG, "File $file has $gbAvailable GB available from $gbCount GB")
            dirs[i] = "${file.path.split("Android")[0]}\n%.2f GB of %.2f GB free\n".format(gbAvailable, gbCount)
        }

        val builder = AlertDialog.Builder(this)
        builder.setTitle("Choose storage location")
        builder.setItems(dirs) { _, which ->
            val newStoragePath = extDirs[which].path
            Log.i(TAG, "Setting new storage path to $newStoragePath")
            mainViewModel.storageLocation.value = newStoragePath
            Preferences(applicationContext).setString(STORAGE_LOCATION, newStoragePath)
        }
        builder.show()
    }

    private fun validStorageLocation(showAlert: Boolean = true): Boolean {
        if (Preferences(applicationContext).getString(STORAGE_LOCATION) == null
                && !mainViewModel.loadDefaultStoragePath(applicationContext)) {
            if (showAlert) {
                messenger.alert("Failed to get a storage location. Please check app permissions")
            }
            return false
        }
        return true
    }

    @Suppress("UNUSED_PARAMETER")
    fun versionClick(v: View) {
        versionClickCountdown--
        if (versionClickCountdown <= 0) {
            loadFragment(DevFragment())
        }
    }

    @Suppress("UNUSED_PARAMETER")
    fun sendTestCrash(v: View) {
        throw RuntimeException("Test Crash")
    }

    @Suppress("UNUSED_PARAMETER")
    fun refresh(view: View) {
        mainViewModel.discovery.value!!.restart(true)
    }

    @Suppress("UNUSED_PARAMETER")
    fun deleteRecordingsAndEvents(view: View) {
        thread {
            mainViewModel.db.value!!.clearData()
        }
    }
}
