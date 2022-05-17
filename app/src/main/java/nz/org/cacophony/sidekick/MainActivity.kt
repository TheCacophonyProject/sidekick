package nz.org.cacophony.sidekick

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.PowerManager
import android.util.Log
import android.view.MenuItem
import android.view.View
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.Toolbar
import androidx.drawerlayout.widget.DrawerLayout
import androidx.fragment.app.Fragment
import androidx.lifecycle.ViewModelProvider
import androidx.navigation.findNavController
import androidx.navigation.ui.AppBarConfiguration
import androidx.navigation.ui.navigateUp
import androidx.navigation.ui.setupActionBarWithNavController
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
    private var versionClickCountdown = 10 // Number of times the image needs to be pressed for the dev fragment will be shown

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        drawerLayout = findViewById(R.id.drawer_layout)
        navView = findViewById(R.id.nav_view)
        toolbar = findViewById(R.id.toolbar)
        setSupportActionBar(toolbar)

        mainViewModel = ViewModelProvider(this).get(MainViewModel::class.java)
        mainViewModel.init(this)
        messenger = mainViewModel.messenger.value!!
        permissionHelper = PermissionHelper(applicationContext)
        permissionHelper.checkAll(this)

        locationHelper = LocationHelper(permissionHelper, mainViewModel, this)
        eventDao = mainViewModel.db.value!!.eventDao()
        recordingDao = mainViewModel.db.value!!.recordingDao()

        mainViewModel.deviceList.value!!.setOnChanged {
            runOnUiThread {
                mainViewModel.deviceListAdapter.value!!.notifyDataSetChanged()
            }
        }

        setViewModelObserves()

        setUpNavigationView()
    }

    override fun onResume() {
        super.onResume()
        thread {
            try {
                CacophonyAPI.updateUserGroupsAndDevices(this)
                mainViewModel.groups.postValue(CacophonyAPI.getGroupList(this))
                mainViewModel.usersDevicesList.postValue(CacophonyAPI.getDevicesList(this))
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
    fun openLoginActivity(v: View? = null) {
        if (CacophonyAPI.isLoggedIn(applicationContext)) {
            runOnUiThread {
                val dialogBuilder = android.app.AlertDialog.Builder(this)
                dialogBuilder
                    .setMessage("Are you sure you want to logout?")
                    .setCancelable(true)
                    .setNegativeButton("Cancel") { _, _ -> }
                    .setPositiveButton("OK") { _, _ ->
                        CacophonyAPI.logout(applicationContext)
                        openLoginActivity()
                    }
                val alert = dialogBuilder.create()
                alert.setTitle("Message")
                alert.show()
            }
        } else {
            val intent = Intent(applicationContext, LoginScreen::class.java)
            intent.flags = Intent.FLAG_ACTIVITY_CLEAR_TOP
            startActivity(intent)
            finish()
        }
    }

    private fun loadFragment(f: Fragment) {
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
    fun cancelUpload(v: View) {
        mainViewModel.call.value?.cancel()
        mainViewModel.uploading.postValue(false)
    }

    @Suppress("UNUSED_PARAMETER")
    fun upload(v: View) {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        val mWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "sidekick:uploading_recordings")
        mWakeLock.acquire(300000) // 5 * 60 * 1000
        if (mainViewModel.uploading.value == true) {
            return
        }
        mainViewModel.uploading.value = true
        thread {
            mainViewModel.eventUploadFailCount.postValue(0)
            mainViewModel.eventUploadSuccessCount.postValue(0)
            mainViewModel.recordingUploadFailCount.postValue(0)
            mainViewModel.recordingUploadSuccessCount.postValue(0)
            val eventsUploadReport = uploadEvents()
            val recordingsUploadReport = uploadRecordings()

            val eventsUploaded = eventsUploadReport["uploaded"]?: 0
            eventsUploadReport.remove("uploaded")
            eventsUploadReport.remove("Canceled")
            val recordingsUploaded = recordingsUploadReport["uploaded"]?: 0
            recordingsUploadReport.remove("uploaded")
            recordingsUploadReport.remove("Canceled")
            if (recordingsUploadReport.size > 0 || eventsUploadReport.size > 0) {
                var message = "Events uploaded: $eventsUploaded\nEvent errors:\n"
                for ((error, num) in eventsUploadReport) {
                    message = "$message\t$num: $error\n"
                }
                message = "$message\nRecordings uploaded: $recordingsUploaded\nRecording errors:\n"
                for ((error, num) in recordingsUploadReport) {
                    message = "$message\t$num: $error\n"
                }
                messenger.alert(message, "Upload errors")
            }

            if (mWakeLock.isHeld) {
                mWakeLock.release()
            }
            runOnUiThread {
                mainViewModel.uploading.value = false
            }
        }
    }

    private fun uploadRecordings(): HashMap<String, Int> {
        val uploadReport = HashMap<String, Int>()
        val recordingsToUpload = recordingDao.getRecordingsToUpload()
        mainViewModel.recordingsBeingUploadedCount.postValue(recordingsToUpload.size)
        mainViewModel.recordingUploadSuccessCount.postValue(0)
        if (recordingsToUpload.isEmpty()) {
            return uploadReport
        }
        for (rec in recordingsToUpload) {
            if (!mainViewModel.uploading.value!!) {
                return uploadReport
            }
            try {
                CacophonyAPI.uploadRecording(applicationContext, rec, mainViewModel.call)
                recordingDao.setAsUploaded(rec.id)
                File(rec.recordingPath).delete()
                mainViewModel.recordingUploadSuccessCount.postValue(
                    (mainViewModel.recordingUploadSuccessCount.value ?: 0) + 1
                )
                uploadReport["uploaded"] = (uploadReport["uploaded"]?: 0) + 1
            } catch (e: Exception) {
                uploadReport[e.message?: "unknown error"] = (uploadReport[e.message?: "unknown error"]?: 0) + 1
                Log.i(TAG, "upload exception ${e.message} stack: ${Log.getStackTraceString(e)}")
                mainViewModel.recordingUploadFailCount.postValue(
                    (mainViewModel.recordingUploadFailCount.value ?: 0) + 1
                )
            }
        }
        return uploadReport
    }

    private fun uploadEvents(): HashMap<String, Int> {
        val uploadReport = HashMap<String, Int>()
        val eventsToUpload = eventDao.getEventsToUpload()
        runOnUiThread {
            mainViewModel.eventsBeingUploadedCount.value = eventsToUpload.size
            mainViewModel.eventUploadSuccessCount.value = 0
            mainViewModel.eventUploadFailCount.value = 0
        }
        if (eventsToUpload.isEmpty()) {
            messenger.toast("No events to upload")
            return uploadReport
        }
        var excludeIDs = emptyList<Int>()
        while (eventDao.getOneNotUploaded(excludeIDs) != null) {
            if (!mainViewModel.uploading.value!!) {
                return uploadReport
            }
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
                    event.details,
                    mainViewModel.call
                )
                mainViewModel.eventUploadSuccessCount.postValue(
                    (mainViewModel.eventUploadSuccessCount.value ?: 0) + timestamps.size
                )
                for (e in events) {
                    eventDao.setAsUploaded(e.id)
                }
                uploadReport["uploaded"] = (uploadReport["uploaded"]?: 0) + timestamps.size
            } catch(e : Exception) {
                mainViewModel.eventUploadFailCount.postValue(
                    (mainViewModel.eventUploadFailCount.value ?: 0) + timestamps.size
                )
                uploadReport[e.message?: "unknown error"] = (uploadReport[e.message?: "unknown error"]?: 0) + timestamps.size
                Log.e(TAG, "Error with uploading events $e")
            }
        }
        return uploadReport
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
        runOnUiThread {
            val dialogBuilder = android.app.AlertDialog.Builder(this)
            dialogBuilder
                .setMessage("Do you wish to delete all events and recordings currently stored on your phone?")
                .setCancelable(true)
                .setNegativeButton("Cancel") { _, _ -> }
                .setPositiveButton("OK") { _, _ -> thread {mainViewModel.db.value!!.clearData() }}
            val alert = dialogBuilder.create()
            alert.setTitle("Message")
            alert.show()
        }
    }
}
