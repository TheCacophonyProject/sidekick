package nz.org.cacophony.sidekick

import android.app.Activity
import android.content.Intent
import android.location.Location
import android.net.Uri
import android.util.Log
import nz.org.cacophony.sidekick.db.*
import okhttp3.HttpUrl
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.ConnectException
import java.net.HttpURLConnection
import java.net.SocketException
import java.net.URL
import kotlin.concurrent.thread

class Device(
        @Volatile var name: String,
        val hostname: String,
        private val port: Int,
        private val activity: Activity,
        private val onChange: (() -> Unit)?,
        private val messenger: Messenger,
        db: RoomDatabase,
        private val mainViewModel: MainViewModel) {
    @Volatile
    var deviceRecordings = emptyArray<String>()
    @Volatile
    var deviceEvents = emptyArray<Int>()
    @Volatile
    var statusString = ""
    @Volatile
    var sm = StateMachine()
    @Volatile
    var downloading = false
    private val pr = PermissionHelper(activity.applicationContext)
    private var devicename: String = name
    private var groupname: String? = null
    private var deviceID: Int = 0
    private var serverURL: String = ""
    private val recordingDao: RecordingDao = db.recordingDao()
    private val eventDao: EventDao = db.eventDao()
    private var apiVersion: Int = 0
    private val api: DeviceAPI = DeviceAPI(hostname, port)

    init {
        Log.i(TAG, "Created new device: $name")
        makeDeviceDir()
        thread(start = true) {
            for (i in 3.downTo(0)) {
                checkConnectionStatus()
                if (sm.state == DeviceState.CONNECTED) {
                    break
                }
                if (i > 0) {
                    Log.i(TAG, "failed to connect to interface, trying $i more times")
                } else {
                    Log.e(TAG, "failed to connect to interface")
                }
            }
            getDeviceInfo()
            deleteUploadedData()
        }
    }

    fun getDeviceInfo() {
        if (sm.state != DeviceState.CONNECTED && sm.state != DeviceState.READY) {
            return
        }
        //for now so devices without latest management will still work
        sm.gotDeviceInfo()
        try {
            val deviceJSON = api.getDeviceInfo()
            devicename = deviceJSON.getString("devicename")
            if (devicename.isEmpty()) {
                devicename = name
            }
            groupname = deviceJSON.getString("groupname")
            deviceID = deviceJSON.getInt("deviceID")
            serverURL = deviceJSON.getString("serverURL")

            val versionJSON = api.getDeviceVersion()
            apiVersion = versionJSON.getInt("apiVersion")

        } catch(e: Exception) {
            Log.e(TAG, e.toString())
            messenger.alert("failed to get device info from $name. ${e.message}")
        }
        sm.gotDeviceInfo()
        updateStatus()
    }

    /**
     * deleteUploadedData will delete data (events and recordings) that have been uploaded to the server.
     */
    private fun deleteUploadedData() {
        if (!checkConnectionStatus(showMessage = true)) {
            return
        }
        checkDataOnDevice()
        deleteUploadedEvents()
        deleteUploadedRecordings()
    }

    private fun deleteUploadedRecordings() {
        val uploadedRecordings = recordingDao.getUploadedFromDevice(devicename, groupname)
        var allDeleted = true
        for (rec in uploadedRecordings) {
            Log.i(TAG, "Uploaded recording: $rec")
            if (rec.name in deviceRecordings) {
                allDeleted = allDeleted && deleteRecordingOnCamera(rec)
            } else {
                recordingDao.deleteRecording(rec.id)
            }
        }
        if (!allDeleted) {
            messenger.alert("Failed to delete some old recordings from device")
        }
    }


    private fun deleteRecordingOnCamera(recording: Recording): Boolean {
        var deleted = false
        try {
            api.deleteRecording(recording.name)
            deleted = true
        } catch (e: Exception) {
            Log.e(TAG, e.toString())
            messenger.toast("Failed to delete '${recording.name}' from '$name'. Error: ${e.message}'")
        }
        return deleted
    }

    private fun deleteUploadedEvents() {
        val uploadedEventIDs = eventDao.getUploadedFromDevice(deviceID)
        val eventsToDelete = mutableListOf<Int>()
        for (uploadedEventID in uploadedEventIDs) {
            if (uploadedEventID in deviceEvents) {
                eventsToDelete.add(uploadedEventID)
            }
        }

        try {
            api.deleteEvents(eventsToDelete.toTypedArray())
        } catch (e: Exception) {
            Log.e(TAG, "Error with deleting recordings $e")
        }
    }

    /**
     * checkDataOnDevice will get the list of recordings and events on the device to compare against
     * what is already collected and uploaded.
     */
    fun checkDataOnDevice() {
        if (!checkConnectionStatus()) {
            return
        }
        checkEventsOnDevice()
        checkRecordingsOnDevice()
        updateStatus()
    }

    /**
     * checkRecordingsOnDevice will get the list of recordings that are on the device
     */
    private fun checkRecordingsOnDevice(): Boolean {
        val recJSON: JSONArray
        try {
            recJSON = api.getRecordingList()
        } catch (e: Exception) {
            Log.e(TAG, "Exception when updating recording list: $e")
            return false
        }
        deviceRecordings = emptyArray()
        for (i in 0 until recJSON.length()) {
            deviceRecordings = deviceRecordings.plus(recJSON.get(i) as String)
        }
        sm.updatedRecordingList()
        return true
    }

    /**
     * checkEventsOnDevice will get the list of events that are on the device
     */
    private fun checkEventsOnDevice(): Boolean {
        if (apiVersion < 2) {
            return false
        }
        val eventsJSON: JSONArray
        try {
            eventsJSON = api.getEventKeys()
        } catch(e: Exception) {
            Log.e(TAG, "Exception when updating event keys: $e")
            return false
        }
        deviceEvents = IntArray(eventsJSON.length()).toTypedArray()
        for (i in 0 until eventsJSON.length()) {
            deviceEvents[i] = eventsJSON.get(i) as Int
        }
        Log.i(TAG, "Event keys: ${deviceEvents.size}")
        return true
    }

    private fun forcedAccess(): Boolean {
        return !userCanAccess() && (mainViewModel.forceCollectionOfData.value?: false)
    }

    private fun canAccess(): Boolean {
        return userCanAccess() || (mainViewModel.forceCollectionOfData.value?: false)
    }

    private fun userCanAccess(): Boolean {
        if (mainViewModel.serverURL.value != serverURL) {
            statusString = "device not registered to same API as user\nUser: ${mainViewModel.serverURL.value}\nDevice: $serverURL"
            onChange?.invoke()
            return false
        }
        if (mainViewModel.groups.value?.indexOf(groupname) == -1 &&
                mainViewModel.usersDevicesList.value?.indexOf(devicename) == -1) {
            statusString = "devices group '$groupname' is not one of users group."
            onChange?.invoke()
            return false
        }
        return true
    }

    fun updateStatus() {
        if (!canAccess()) {
            return
        }
        var newStatus = when {
            !sm.state.connected -> sm.state.message
            !sm.hasRecordingList -> "Checking for recordings"
            else -> "${deviceRecordings.size - recordingsToDownload().size} of ${deviceRecordings.size} of recordings collected\n" +
                    "${deviceEvents.size - eventsToDownload().size} of ${deviceEvents.size} of events collected"
        }
        if (forcedAccess()) {
            newStatus = "Access to device is being forced. Users might not be able to upload data from this device\n$newStatus"
        }
        if (newStatus != statusString) {
            statusString = newStatus
            onChange?.invoke()
        }
    }

    private fun eventsToDownload(): Array<Int> {
        val toDownload = mutableListOf<Int>()
        val downloadedEventsIDs = eventDao.getDeviceEventIDs(deviceID)
        for (deviceEvent in deviceEvents) {
            if (deviceEvent !in downloadedEventsIDs) {
                toDownload.add(deviceEvent)
            }
        }
        return toDownload.toTypedArray()
    }

    private fun recordingsToDownload(): Array<String> {
        val toDownload = mutableListOf<String>()
        val downloadedRecordings = recordingDao.getRecordingNamesForDevice(devicename, groupname)
        for (rec in deviceRecordings) {
            if (rec !in downloadedRecordings) {
                toDownload.add(rec)
            }
        }
        return toDownload.toTypedArray()
    }

    fun startDownloadRecordings() {
        if (!canAccess()) {
            return
        }
        if (sm.state != DeviceState.READY || downloading) {
            return
        }
        if (!pr.check(android.Manifest.permission.WRITE_EXTERNAL_STORAGE)) {
            messenger.alert("App doesn't have permission to write to storage. Canceling download.")
            return
        }
        if (!makeDeviceDir()) {
            messenger.alert("Failed to write to local storage. Canceling download.")
            return
        }
        try {
            downloading = true
            sm.downloadingRecordings(true)
            checkRecordingsOnDevice()
            Log.i(TAG, "Download recordings from '$name'")

            var allDownloaded = true
            val toDownload = recordingsToDownload()
            Log.i(TAG, "Downloading ${toDownload.size} recordings from $devicename")
            for (recordingName in toDownload) {
                Util.checkAvailableStorage(activity.applicationContext)
                Log.i(TAG, "Downloading recording $recordingName")
                if (downloadRecording(recordingName)) {
                    val outFile = File(getDeviceDir(), recordingName)
                    val recording = Recording(devicename, outFile.toString(), recordingName, groupname, deviceID)
                    recordingDao.insert(recording)
                } else {
                    allDownloaded = false
                    if (!checkConnectionStatus(showMessage = true)) break
                }
                updateStatus()
                //TODO note in the db if the recording failed
            }
            if (!allDownloaded) {
                messenger.alert("Failed to download some recordings")
            }
        } finally {
            sm.downloadingRecordings(false)
            downloading = false
            updateStatus()
        }
    }

    private fun downloadRecording(recordingName: String): Boolean {
        var downloaded = false
        try {
            api.downloadRecording(recordingName, File(getDeviceDir(), recordingName))
            downloaded = true
        } catch (e: Exception) {
            messenger.toast("Error with downloading recording from '$name'")
            Log.e(TAG, "Exception when downloading recording: $e")
        }
        return downloaded
    }

    // Will compare deviceEvents with the events already in the DB and just return the missing ones
    private fun getMissingEventKeys(): Array<Int> {
        var missing = emptyArray<Int>()
        for (eventKey in deviceEvents) {
            if (eventDao.getDeviceEvent(deviceID, eventKey) == null) {
                missing = missing.plus(eventKey)
            }
        }
        return missing
    }

    fun downloadEvents() {
        if (!canAccess()) {
            return
        }
        val missingEventKeys = getMissingEventKeys()
        if (missingEventKeys.isEmpty()) {
            Log.i(TAG, "No events to get from device")
            return
        }
        Log.i(TAG, "Getting ${missingEventKeys.size} events from $name")
        try {
            val responseJSON = api.downloadEvents(missingEventKeys)
            for (eventKey in responseJSON.keys()) {
                addEvent(eventKey.toInt(), responseJSON.getJSONObject(eventKey))
            }
        } catch (e : Exception) {
            messenger.toast("failed to download all events")
            Log.e(TAG, e.toString())
        }
    }

    private fun addEvent(eventKey: Int, eventResponse: JSONObject) {
        if (!eventResponse.getBoolean("success")) {
            Log.e(TAG, "event $eventKey failed: ${eventResponse.get("error")}")
            return
        }

        val eventJSON = eventResponse.getJSONObject("event")
        val timestamp = eventJSON.getString("Timestamp")
        val type = eventJSON.getString("Type")
        var details = "{}"
        if (!eventJSON.isNull("Details")) {
            details = eventJSON.getJSONObject("Details").toString()
        }
        //TODO check that the timestamp, type, details... are sensible values
        val event = Event(deviceID, eventKey, timestamp, type, details)
        Log.i(TAG, "Adding event: $event")
        eventDao.insertAll(event)
    }


    private fun getDeviceDir(): File {
        val prefs = Preferences(activity.applicationContext)
        return File("${prefs.getString(STORAGE_LOCATION)}/devices/$name")
    }

    private fun makeDeviceDir(): Boolean {
        return getDeviceDir().isDirectory || getDeviceDir().mkdirs()
    }

    fun openManagementInterface() {
        thread(start = true) {
            Log.i(TAG, "open interface")
            if (checkConnectionStatus(timeout = 1000, showMessage = true, retries = 1)) {
                val httpBuilder = HttpUrl.parse(URL("http", hostname, port, "/").toString())!!.newBuilder()
                val groupList = CacophonyAPI.getGroupList(activity.application.applicationContext)
                httpBuilder.addQueryParameter("groups", groupList?.joinToString("--"))
                val uri = Uri.parse(httpBuilder.build().toString())
                val i = Intent(activity, DeviceWebViewActivity::class.java)
                i.putExtra("uri", uri.toString())
                activity.startActivity(i)

                //val groupList = CacophonyAPI.getGroupList(activity.application.applicationContext)
                //httpBuilder.addQueryParameter("groups", groupList?.joinToString("--"))
                //activity.startActivity(i)
                //DeviceWebViewFragment.newInstance("http://$hostname:$port")
                /*
                    val httpBuilder = HttpUrl.parse(URL("http", hostname, port, "/").toString())!!.newBuilder()
                    val groupList = CacophonyAPI.getGroupList(activity.application.applicationContext)
                    httpBuilder.addQueryParameter("groups", groupList?.joinToString("--"))
                    val uri = Uri.parse(httpBuilder.build().toString())
                    Log.d(TAG, "opening browser to: $uri")
                    val urlIntent = Intent(Intent.ACTION_VIEW, uri)
                    urlIntent.putExtra(Browser.EXTRA_APPLICATION_ID, "$TAG-$name")  // Single browse tab per device
                    activity.startActivity(urlIntent)
                */
            }
        }
    }

    fun checkConnectionStatus(timeout: Int = 3000, showMessage: Boolean = false, retries: Int = 3): Boolean {
        var connected = false
        for (i in 1..retries) {
            updateStatus()
            try {
                val conn = URL("http://$hostname").openConnection() as HttpURLConnection
                conn.connectTimeout = timeout
                conn.readTimeout = timeout
                conn.responseCode
                conn.disconnect()
                sm.connected()
                connected = true
                break
            } catch (e: SocketException) {
                Log.i(TAG, "failed to connect to device")
                sm.connectionFailed()
            } catch (e: ConnectException) {
                sm.connectionToDeviceOnly()
                Log.i(TAG, "failed to connect to interface")
            } catch (e: Exception) {
                Log.e(TAG, "failed connecting to device $e")
                sm.connectionFailed()
            }
            if (i != retries) {
                updateStatus()
                Thread.sleep(3000)
            }
        }
        if (showMessage && !connected) {
            messenger.alert("$name: ${sm.state.message}")
        }
        updateStatus()
        return connected
    }

    fun updateLocation(location: Location): Boolean {
        var updated = false
        try {
            api.setLocation(location)
            updated = true
        } catch (e: Exception) {
            Log.i(TAG, "failed to update location on device: $e")
        }
        return updated
    }
}

class StateMachine {

    var state = DeviceState.FOUND
    var hasRecordingList = false
    private var hasDeviceInfo = false
    private var hasConnected = false

    fun downloadingRecordings(downloading: Boolean) {
        if (downloading) {
            updateState(DeviceState.DOWNLOADING_RECORDINGS)
        } else if (state == DeviceState.DOWNLOADING_RECORDINGS) {
            updateState(DeviceState.READY)
        }
    }

    fun connected() {
        hasConnected = true
        if (!state.connected) {
            if (hasDeviceInfo) {
                updateState(DeviceState.READY)
            } else {
                updateState(DeviceState.CONNECTED)
            }
        }
    }

    fun connectionToDeviceOnly() {
        hasConnected = true
        updateState(DeviceState.ERROR_CONNECTING_TO_INTERFACE)
    }

    fun connectionFailed() {
        updateState(DeviceState.ERROR_CONNECTING_TO_DEVICE)
    }

    fun gotDeviceInfo() {
        hasDeviceInfo = true
        updateState(DeviceState.READY)
    }

    fun updatedRecordingList() {
        hasRecordingList = true
    }

    private fun updateState(newState: DeviceState) {
        if (state == newState) return
        val validSwitch = when (state) {
            DeviceState.FOUND -> {
                true
            }
            DeviceState.RECONNECT -> {
                true
            }
            DeviceState.CONNECTED -> {
                newState in arrayListOf(
                        DeviceState.READY,
                        DeviceState.ERROR_CONNECTING_TO_INTERFACE,
                        DeviceState.ERROR_CONNECTING_TO_DEVICE,
                        DeviceState.RECONNECT
                )
            }
            DeviceState.READY -> {
                newState in arrayListOf(
                        DeviceState.DOWNLOADING_RECORDINGS,
                        DeviceState.ERROR_CONNECTING_TO_INTERFACE,
                        DeviceState.ERROR_CONNECTING_TO_DEVICE,
                        DeviceState.RECONNECT
                )
            }
            DeviceState.DOWNLOADING_RECORDINGS -> {
                newState in arrayListOf(
                        DeviceState.READY,
                        DeviceState.ERROR_CONNECTING_TO_INTERFACE,
                        DeviceState.ERROR_CONNECTING_TO_DEVICE,
                        DeviceState.RECONNECT
                )
            }
            DeviceState.ERROR_CONNECTING_TO_DEVICE -> {
                newState in arrayListOf(
                        DeviceState.CONNECTED,
                        DeviceState.ERROR_CONNECTING_TO_DEVICE,
                        DeviceState.RECONNECT
                )
            }
            DeviceState.ERROR_CONNECTING_TO_INTERFACE -> {
                newState in arrayListOf(
                        DeviceState.CONNECTED,
                        DeviceState.ERROR_CONNECTING_TO_DEVICE,
                        DeviceState.RECONNECT
                )
            }
        }
        if (validSwitch) {
            state = newState
        }
        if (!validSwitch) {
            Log.e(TAG, "Invalid state switch from $state to $newState")
        }
    }
}

enum class DeviceState(val message: String, val connected: Boolean) {
    FOUND("Found device. Trying to connect", false),
    CONNECTED("Connected.", true),
    RECONNECT("Trying to reconnect", false),
    READY("Got device info.", true),
    DOWNLOADING_RECORDINGS("Downloading recordings.", true),
    ERROR_CONNECTING_TO_DEVICE("Error connecting.", false),
    ERROR_CONNECTING_TO_INTERFACE("Error connecting to interface.", false),
}
