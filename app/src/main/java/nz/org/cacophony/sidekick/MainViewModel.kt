package nz.org.cacophony.sidekick

import android.app.Activity
import android.content.Context
import android.content.IntentFilter
import android.net.nsd.NsdManager
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import nz.org.cacophony.sidekick.db.RoomDatabase
import okhttp3.Call
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
    val recordingsBeingUploadedCount = MutableLiveData<Int>().apply { value = 0 }
    val recordingUploadSuccessCount = MutableLiveData<Int>().apply { value = 0 }
    val recordingUploadFailCount = MutableLiveData<Int>().apply { value = 0 }
    val eventsBeingUploadedCount = MutableLiveData<Int>().apply { value = 0 }
    val eventUploadSuccessCount = MutableLiveData<Int>().apply { value = 0 }
    val eventUploadFailCount = MutableLiveData<Int>().apply { value = 0 }
    val locationStatusText = MutableLiveData<String>().apply { value = "" }
    val storageLocation = MutableLiveData<String>().apply { value = "" }
    val scanning = MutableLiveData<Boolean>().apply { value = false }
    val groups = MutableLiveData<List<String>>().apply { value = emptyList() }
    val usersDevicesList = MutableLiveData<List<String>>().apply { value = emptyList() }
    val serverURL = MutableLiveData<String>().apply { value = "" }
    val call = MutableLiveData<Call>()
    val forceCollectionOfData = MutableLiveData<Boolean>()

    lateinit var wifiHelper: WifiHelper
    val networkIntentFilter = IntentFilter()

    fun init(activity: Activity) {
        serverURL.value = CacophonyAPI.getServerURL(activity.applicationContext)
        groups.value = CacophonyAPI.getGroupList(activity.applicationContext)
        usersDevicesList.value = CacophonyAPI.getDevicesList(activity.applicationContext)
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
        forceCollectionOfData.value = Preferences(activity).getBoolean(FORCE_COLLECTION)
    }

    fun loadDefaultStoragePath(c: Context): Boolean {
        val extPath = c.getExternalFilesDir(null)?.path ?: return false
        storageLocation.value = extPath
        Preferences(c).setString(STORAGE_LOCATION, extPath)
        return true
    }
}