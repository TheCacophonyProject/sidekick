package nz.org.cacophony.sidekick

import android.Manifest
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.annotation.RequiresPermission
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import nz.org.cacophony.sidekick.device.DeviceInterface

@CapacitorPlugin(name = "Device")
class DevicePlugin : Plugin() {

    companion object {
        private const val TAG = "DevicePlugin"
        private const val TARGET_AP_SSID = "bushnet"
    }

    // Main device interface
    private lateinit var device: DeviceInterface

    // Enhanced NSD discovery component
    private lateinit var nsdHelper: NsdHelper

    // Enhanced AP connection component
    private lateinit var apConnector: ApConnector

    // Multicast lock for NSD
    private lateinit var multicastLock: WifiManager.MulticastLock

    // Coroutine scope for async operations
    private val coroutineScope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    // For tracking long-running operations
    private var discoveryActive = false

    // Main handler for UI updates
    private val mainHandler = Handler(Looper.getMainLooper())
    
    // Network callback for monitoring WiFi connections
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    
    // Flag to track if monitoring is active
    private var isMonitoringActive = false
    
    // Last known AP connection state 
    private var lastKnownAPState = false

    // Add a flag to track if monitoring has been initialized
    private var isMonitoringInitialized = false

    /**
     * Plugin initialization
     */
    @RequiresPermission(Manifest.permission.ACCESS_NETWORK_STATE)
    override fun load() {
        super.load()
        Log.d(TAG, "Loading DevicePlugin")

        // Initialize device interface
        device = DeviceInterface(context.applicationContext.filesDir.absolutePath)

        // Initialize multicast lock for NSD
        val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        multicastLock = wifi.createMulticastLock("deviceMulticastLock").apply {
            setReferenceCounted(true)
        }

        // Initialize enhanced NSD helper
        nsdHelper = NsdHelper(context.applicationContext).apply {
            onServiceResolved = { service ->
                Log.d(TAG, "Service resolved: ${service.serviceName}")
                val serviceJson = JSObject().apply {
                    val endpoint = "${service.serviceName}.local"
                    put("endpoint", endpoint)
                    put("host", service.host.hostAddress)
                    put("port", service.port)
                }
                notifyListeners("onServiceResolved", serviceJson)
            }

            onServiceLost = { service ->
                Log.d(TAG, "Service lost: ${service.serviceName}")
                val result = JSObject().apply {
                    val endpoint = "${service.serviceName}.local"
                    put("endpoint", endpoint)
                }
                notifyListeners("onServiceLost", result)
            }

            onServiceResolveFailed = { serviceName, errorCode, message ->
                Log.d(TAG, "Service resolve failed: $serviceName, code=$errorCode")
                val result = JSObject().apply {
                    put("endpoint", serviceName)
                    put("errorCode", errorCode)
                    put("message", message)
                }
                notifyListeners("onServiceResolveFailed", result)
            }

            onDiscoveryError = { error, isFatal ->
                Log.e(TAG, "Discovery error: ${error.message}, fatal=$isFatal")
                val obj = JSObject().apply {
                    put("error", error.message)
                    put("fatal", isFatal)
                }
                notifyListeners("onDiscoveryError", obj)

                if (isFatal) {
                    discoveryActive = false
                }
            }

            onDiscoveryStateChanged = { newState ->
                Log.d(TAG, "Discovery state changed: $newState")
                val obj = JSObject().apply {
                    put("state", newState.name)
                }
                notifyListeners("onDiscoveryStateChanged", obj)

                // Update tracking flag based on state
                discoveryActive = when (newState) {
                    NsdHelper.DiscoveryState.ACTIVE,
                    NsdHelper.DiscoveryState.STARTING,
                    NsdHelper.DiscoveryState.RESTARTING -> true

                    else -> false
                }
            }
        }

        // Initialize enhanced AP connector
        apConnector = ApConnector(context.applicationContext)

        // Register AP connection callbacks
        apConnector.addConnectionCallback(object : ApConnector.ConnectionCallbacks {
            override fun onStateChanged(newState: ApConnector.ConnectionState) {
                val stateObj = JSObject().apply {
                    put("state", newState.name)
                }
                notifyListeners("onAPConnectionStateChanged", stateObj)
            }

            override fun onConnected() {
                val result = JSObject().apply {
                    put("status", "connected")
                }
                notifyListeners("onAPConnected", result)
            }

            override fun onDisconnected() {
                val result = JSObject().apply {
                    put("status", "disconnected")
                }
                notifyListeners("onAPDisconnected", result)
            }

            override fun onConnectionFailed(reason: String, canRetry: Boolean) {
                val result = JSObject().apply {
                    put("status", "error")
                    put("error", reason)
                    put("canRetry", canRetry)
                }
                notifyListeners("onAPConnectionFailed", result)
            }

            override fun onConnectionLost() {
                val result = JSObject().apply {
                    put("status", "lost")
                }
                notifyListeners("onAPConnectionLost", result)
            }
        })
        
        // Start monitoring the AP connection automatically
        startAPConnectionMonitoring()
    }

    /**
     * Clean up all resources
     */
    override fun handleOnDestroy() {
        super.handleOnDestroy()
        Log.d(TAG, "Destroying DevicePlugin")

        // Clean up all resources
        stopDiscovery()
        stopAPConnectionMonitoring()

        if (multicastLock.isHeld) {
            multicastLock.release()
        }

        // Ensure nsdHelper is properly cleaned up
        nsdHelper.cleanup()
        apConnector.cleanup()
        coroutineScope.cancel()
    }

    /**
     * Start continuous monitoring of the AP connection state
     */
    @RequiresPermission(Manifest.permission.ACCESS_NETWORK_STATE)
    private fun startAPConnectionMonitoring() {
        if (isMonitoringActive) {
            return
        }
        
        try {
            val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            
            // Create network callback to monitor connectivity changes
            val networkCallback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    checkAndNotifyAPConnectionState(connectivityManager, network, true)
                }
                
                override fun onLost(network: Network) {
                    // This might be any network, so we need to check if we're still connected to our AP
                    checkAndNotifyAPConnectionState(connectivityManager, null, false)
                }
                
                override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
                    checkAndNotifyAPConnectionState(connectivityManager, network, true)
                }
            }
            
            // Register callback with a request that matches WiFi networks
            val request = NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                .build()
            
            connectivityManager.registerNetworkCallback(request, networkCallback)
            this.networkCallback = networkCallback
            isMonitoringActive = true
            
            // Do an initial check of the connection state
            checkAndNotifyAPConnectionState(connectivityManager, null, false)
            
            Log.d(TAG, "Started AP connection monitoring")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start AP connection monitoring: ${e.message}")
        }
    }
    
    /**
     * Stop continuous monitoring of the AP connection state
     */
    private fun stopAPConnectionMonitoring() {
        if (!isMonitoringActive || networkCallback == null) {
            return
        }
        
        try {
            val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            connectivityManager.unregisterNetworkCallback(networkCallback!!)
            networkCallback = null
            isMonitoringActive = false
            Log.d(TAG, "Stopped AP connection monitoring")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping AP connection monitoring: ${e.message}")
        }
    }
    
    /**
     * Check if device is connected to the target AP and notify listeners of any change
     */
    private fun checkAndNotifyAPConnectionState(connectivityManager: ConnectivityManager, network: Network?, forcedCheck: Boolean) {
        coroutineScope.launch(Dispatchers.Main) {
            val isConnected = isConnectedToTargetAP(connectivityManager, network)
            
            // Only notify if the state has changed
            if (isConnected != lastKnownAPState || forcedCheck) {
                lastKnownAPState = isConnected
                
                // Don't automatically send DISCONNECTED on startup as it would disable the button
                // Only send state changes after an explicit connection attempt or when forcedCheck is true
                val stateObj = JSObject().apply {
                    // During initial check, if disconnected, send "default" instead of "DISCONNECTED"
                    put("state", if (isConnected) "CONNECTED" else 
                        if (!forcedCheck && !isMonitoringInitialized) "default" else "DISCONNECTED")
                }
                notifyListeners("onAPConnectionStateChanged", stateObj)
                
                if (isConnected) {
                    val result = JSObject().apply {
                        put("status", "connected")
                    }
                    notifyListeners("onAPConnected", result)
                } else if (forcedCheck || isMonitoringInitialized) {
                    // Only notify disconnected after initial check
                    val result = JSObject().apply {
                        put("status", "disconnected") 
                    }
                    notifyListeners("onAPDisconnected", result)
                }
                
                isMonitoringInitialized = true
            }
        }
    }
    
    /**
     * Check if connected to our target AP network
     */
    private fun isConnectedToTargetAP(connectivityManager: ConnectivityManager, specificNetwork: Network?): Boolean {
        try {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val wifiInfo = wifiManager.connectionInfo
            
            if (wifiInfo == null || wifiInfo.ssid.isEmpty()) {
                return false
            }
            
            // SSID in WifiInfo is usually wrapped in quotes
            val ssid = wifiInfo.ssid.replace("\"", "")
            
            // Check if connected to our target AP
            return ssid == TARGET_AP_SSID
        } catch (e: Exception) {
            Log.e(TAG, "Error checking AP connection: ${e.message}")
            return false
        }
    }

    // -----------------------------
    // DISCOVERY
    // -----------------------------
    /**
     * Start device discovery
     */
    @PluginMethod
    fun discoverDevices(call: PluginCall) {
        Log.d(TAG, "Starting device discovery")

        if (discoveryActive) {
            call.reject("Discovery is already in progress")
            return
        }

        try {
            // Acquire multicast lock if needed
            if (!multicastLock.isHeld) {
                multicastLock.acquire()
            }

            // Start enhanced discovery
            nsdHelper.startDiscovery()
            discoveryActive = true

            call.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start discovery: ${e.message}")
            if (multicastLock.isHeld) {
                multicastLock.release()
            }
            discoveryActive = false
            call.reject("Failed to start discovery: ${e.message}")
        }
    }

    /**
     * Stop device discovery
     */
    @PluginMethod
    fun stopDiscoverDevices(call: PluginCall) {
        Log.d(TAG, "Stopping device discovery")

        val result = JSObject()

        try {
            // Stop NSD discovery
            nsdHelper.stopDiscovery()

            // Release multicast lock
            if (multicastLock.isHeld) {
                multicastLock.release()
            }

            discoveryActive = false
            result.put("success", true)
            call.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping discovery: ${e.message}")
            result.put("success", false)
            result.put("message", e.message)
            call.resolve(result)
        }
    }

    // -----------------------------
    // CONNECT / DISCONNECT from bushnet
    // -----------------------------
    /**
     * Connect to device AP
     */
    @PluginMethod(returnType = PluginMethod.RETURN_PROMISE)
    fun connectToDeviceAP(call: PluginCall) {
        Log.d(TAG, "Connecting to device AP")

        coroutineScope.launch(Dispatchers.Main) {
            try {
                // Check current state
                if (apConnector.connectionState == ApConnector.ConnectionState.CONNECTED) {
                    val result = JSObject().apply {
                        put("status", "connected")
                    }
                    call.resolve(result)
                    return@launch
                }

                // Start connection attempt
                val started = apConnector.connect()

                if (!started) {
                    val result = JSObject().apply {
                        put("status", "error")
                        put("error", "Could not start connection process")
                    }
                    call.resolve(result)
                    return@launch
                }

                // Connection process started successfully
                // Wait for callbacks to handle the rest
                // We'll resolve immediately to let the UI know we're connecting
                val result = JSObject().apply {
                    put("status", "connecting")
                }
                call.resolve(result)
            } catch (e: Exception) {
                Log.e(TAG, "Error connecting to AP: ${e.message}")
                val result = JSObject().apply {
                    put("status", "error")
                    put("error", e.message)
                }
                call.resolve(result)
            }
        }
    }

    /**
     * Disconnect from device AP
     */
    @PluginMethod(returnType = PluginMethod.RETURN_PROMISE)
    fun disconnectFromDeviceAP(call: PluginCall) {
        Log.d(TAG, "Disconnecting from device AP")

        coroutineScope.launch(Dispatchers.Main) {
            try {
                // Check current state
                if (apConnector.connectionState != ApConnector.ConnectionState.CONNECTED &&
                    apConnector.connectionState != ApConnector.ConnectionState.CONNECTION_LOST
                ) {
                    val result = JSObject().apply {
                        put("success", true)
                        put("message", "Already disconnected")
                    }
                    call.resolve(result)
                    return@launch
                }

                // Start disconnect
                val started = apConnector.disconnect()

                if (!started) {
                    val result = JSObject().apply {
                        put("success", false)
                        put("message", "Could not start disconnect process")
                    }
                    call.resolve(result)
                    return@launch
                }

                // Disconnect process started
                // We'll resolve immediately to let the UI know we're disconnecting
                val result = JSObject().apply {
                    put("success", true)
                    put("message", "Disconnecting from device AP")
                }
                call.resolve(result)
            } catch (e: Exception) {
                Log.e(TAG, "Error disconnecting from AP: ${e.message}")
                val result = JSObject().apply {
                    put("success", false)
                    put("message", e.message)
                }
                call.resolve(result)
            }
        }
    }

    /**
     * Check if AP connection is active
     * Note: This method is still kept for backward compatibility but
     * should no longer be needed with the continuous monitoring in place
     */
    @PluginMethod
    fun checkIsAPConnected(call: PluginCall) {
        Log.d(TAG, "Checking AP connection")

        val result = JSObject()
        try {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val wifiInfo = wifiManager.connectionInfo
            
            val connected = if (wifiInfo != null && wifiInfo.ssid.isNotEmpty()) {
                val ssid = wifiInfo.ssid.replace("\"", "")
                ssid == TARGET_AP_SSID
            } else {
                false
            }
            
            // Update our last known state while we're at it
            if (connected != lastKnownAPState) {
                lastKnownAPState = connected
                
                // Trigger a state change notification
                val stateObj = JSObject().apply {
                    put("state", if (connected) "CONNECTED" else "DISCONNECTED") 
                }
                notifyListeners("onAPConnectionStateChanged", stateObj)
            }
            
            result.put("connected", connected)
            result.put("success", true)
        } catch (e: Exception) {
            Log.e(TAG, "Error checking AP connection: ${e.message}")
            result.put("connected", false)
            result.put("success", false)
            result.put("message", e.message)
        }
        call.resolve(result)
    }

    /**
     * Check if we have an active network connection
     */
    @RequiresPermission(Manifest.permission.ACCESS_NETWORK_STATE)
    @PluginMethod
    fun hasConnection(call: PluginCall) {
        Log.d(TAG, "Checking network connection")

        val result = JSObject()
        try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

            val network = cm.activeNetwork
            val capabilities = cm.getNetworkCapabilities(network)
            val isConnected = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)

            result.put("success", true)
            result.put("connected", isConnected)
        } catch (e: Exception) {
            Log.e(TAG, "Error checking connection: ${e.message}")
            result.put("success", false)
            result.put("connected", false)
            result.put("message", e.message)
        }
        call.resolve(result)
    }

    // -----------------------------
    // Helper methods
    // -----------------------------
    /**
     * Safely stop discovery
     */
    private fun stopDiscovery() {
        try {
            nsdHelper.stopDiscovery()
            discoveryActive = false
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping discovery: ${e.message}")
        }
    }

    // -----------------------------
    // Other plugin calls (delegated to device interface)
    // -----------------------------
    @PluginMethod
    fun checkDeviceConnection(call: PluginCall) {
        device.checkDeviceConnection(pluginCall(call))
    }

    @PluginMethod
    fun getDeviceInfo(call: PluginCall) {
        device.getDeviceInfo(pluginCall(call))
    }

    @PluginMethod
    fun getDeviceConfig(call: PluginCall) {
        device.getDeviceConfig(pluginCall(call))
    }

    @PluginMethod
    fun setDeviceConfig(call: PluginCall) {
        device.setDeviceConfig(pluginCall(call))
    }

    @PluginMethod
    fun setLowPowerMode(call: PluginCall) {
        device.setLowPowerMode(pluginCall(call))
    }

    @PluginMethod
    fun updateRecordingWindow(call: PluginCall) {
        device.updateRecordingWindow(pluginCall(call))
    }

    @PluginMethod
    fun setDeviceLocation(call: PluginCall) {
        device.setDeviceLocation(pluginCall(call))
    }

    @PluginMethod
    fun getDeviceLocation(call: PluginCall) {
        device.getDeviceLocation(pluginCall(call))
    }

    @PluginMethod
    fun getRecordings(call: PluginCall) {
        device.getRecordings(pluginCall(call))
    }

    @PluginMethod
    fun getEventKeys(call: PluginCall) {
        device.getEventKeys(pluginCall(call))
    }

    @PluginMethod
    fun getEvents(call: PluginCall) {
        device.getEvents(pluginCall(call))
    }

    @PluginMethod
    fun deleteEvents(call: PluginCall) {
        device.deleteEvents(pluginCall(call))
    }

    @PluginMethod
    fun downloadRecording(call: PluginCall) {
        device.downloadRecording(pluginCall(call))
    }

    @PluginMethod
    fun deleteRecordings(call: PluginCall) {
        device.deleteRecordings(pluginCall(call))
    }

    @PluginMethod
    fun deleteRecording(call: PluginCall) {
        device.deleteRecording(pluginCall(call))
    }

    @PluginMethod
    fun reregisterDevice(call: PluginCall) {
        device.reregister(pluginCall(call))
    }

    @PluginMethod
    fun updateWifi(call: PluginCall) {
        device.updateWifi(pluginCall(call))
    }

    @PluginMethod
    fun turnOnModem(call: PluginCall) {
        device.turnOnModem(pluginCall(call))
    }

    @PluginMethod
    fun checkPermission(call: PluginCall) {
        val result = JSObject().apply {
            // Check for required permissions
            val fineLocationGranted =
                context.checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) ==
                        android.content.pm.PackageManager.PERMISSION_GRANTED

            put("granted", fineLocationGranted)
        }
        call.resolve(result)
    }

    @PluginMethod
    fun getTestText(call: PluginCall) {
        val result = JSObject().apply {
            put("text", "Test successful! Plugin is working correctly.")
        }
        call.resolve(result)
    }
}