package nz.org.cacophony.sidekick

import android.app.Activity
import android.content.Context
import android.content.IntentFilter
import android.net.nsd.NsdManager
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel

class MainViewModel : ViewModel() {

    val title = MutableLiveData<String>().apply { value = "" }

    val permissionHelper = MutableLiveData<PermissionHelper>()
    val messenger = MutableLiveData<Messenger>()
    val deviceList = MutableLiveData<DeviceList>()
    val deviceListAdapter = MutableLiveData<DeviceListAdapter>()
    val discovery = MutableLiveData<DiscoveryManager>()
    val recordingDao = MutableLiveData<RecordingDao>()
    lateinit var wifiHelper: WifiHelper
    val networkIntentFilter = IntentFilter()

    fun init(activity: Activity) {
        permissionHelper.value = PermissionHelper(activity.applicationContext)
        permissionHelper.value!!.checkAll(activity)
        messenger.value = Messenger(activity)
        val dl = DeviceList()
        deviceList.value = dl
        deviceListAdapter.value = DeviceListAdapter(dl)
        val nsdManager = activity.getSystemService(Context.NSD_SERVICE) as NsdManager
        discovery.value = DiscoveryManager(nsdManager, dl, activity, messenger.value!!)
        val db = RecordingRoomDatabase.getDatabase(activity)
        recordingDao.value = db.recordingDao()

        wifiHelper = WifiHelper(activity.applicationContext)

        networkIntentFilter.addAction("android.net.conn.CONNECTIVITY_CHANGE")
        networkIntentFilter.addAction("android.net.wifi.WIFI_STATE_CHANGED")
        networkIntentFilter.addAction("android.net.wifi.WIFI_AP_STATE_CHANGED")
    }
}