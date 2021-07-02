package nz.org.cacophony.sidekick

import android.app.Activity
import android.content.Context
import android.content.IntentFilter
import android.net.nsd.NsdManager
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import nz.org.cacophony.sidekick.db.RoomDatabase
import java.lang.Exception

class MainViewModel : ViewModel() {

    val title = MutableLiveData<String>().apply { value = "" }

    val messenger = MutableLiveData<Messenger>()
    val deviceList = MutableLiveData<DeviceList>()
    val deviceListAdapter = MutableLiveData<DeviceListAdapter>()
    val discovery = MutableLiveData<DiscoveryManager>()
    val db = MutableLiveData<RoomDatabase>()
    val uploading = MutableLiveData<Boolean>().apply { value = false }
    val downloading = MutableLiveData<Boolean>().apply { value = false }
    val recordingUploadingProgress = MutableLiveData<Int>().apply { value = 0 }
    val eventUploadingProgress = MutableLiveData<Int>().apply { value = 0 }
    val recordingsBeingUploadedCount = MutableLiveData<Int>().apply { value = 0 }
    val eventsBeingUploadedCount = MutableLiveData<Int>().apply { value = 0 }
    val locationStatusText = MutableLiveData<String>().apply { value = "" }
    val storageLocation = MutableLiveData<String>().apply { value = "" }
    val scanning = MutableLiveData<Boolean>().apply { value = false }

    lateinit var wifiHelper: WifiHelper
    val networkIntentFilter = IntentFilter()

    fun init(activity: Activity) {
        messenger.value = Messenger(activity)
        val dl = DeviceList()
        deviceList.value = dl
        deviceListAdapter.value = DeviceListAdapter(dl)
        val nsdManager = activity.getSystemService(Context.NSD_SERVICE) as NsdManager
        val database = RoomDatabase.getDatabase(activity) ?: throw Exception("failed to get database")
        discovery.value = DiscoveryManager(nsdManager, dl, activity, messenger.value!!, database, this)
        db.value = database

        wifiHelper = WifiHelper(activity.applicationContext)

        networkIntentFilter.addAction("android.net.conn.CONNECTIVITY_CHANGE")
        networkIntentFilter.addAction("android.net.wifi.WIFI_STATE_CHANGED")
        networkIntentFilter.addAction("android.net.wifi.WIFI_AP_STATE_CHANGED")

        storageLocation.value = Preferences(activity).getString(STORAGE_LOCATION)
        if (storageLocation.value == null) {
            loadDefaultStoragePath(activity.applicationContext)
        }
    }

    fun loadDefaultStoragePath(c: Context): Boolean {
        val extPath = c.getExternalFilesDir(null)?.path ?: return false
        storageLocation.value = extPath
        Preferences(c).setString(STORAGE_LOCATION, extPath)
        return true
    }
}