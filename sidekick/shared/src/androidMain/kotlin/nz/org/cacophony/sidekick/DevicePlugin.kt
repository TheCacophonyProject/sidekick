package nz.org.cacophony.sidekick
import android.app.Activity.RESULT_OK
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiConfiguration
import android.net.wifi.WifiManager
import android.net.wifi.WifiNetworkSpecifier
import android.os.Build
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import nz.org.cacophony.sidekick.device.DeviceInterface

@CapacitorPlugin(name = "Device")
class DevicePlugin: Plugin() {
    private val type = "_cacophonator-management._tcp"

    private lateinit var nsdManager: NsdManager
    private lateinit var discoveryListener: NsdManager.DiscoveryListener
    private var callQueue: MutableMap<String, CallType> = mutableMapOf()

    private lateinit var device: DeviceInterface
    private var wifiNetwork: Network? = null;
    var currNetworkCallback: ConnectivityManager.NetworkCallback? = null
    private var cm: ConnectivityManager? = null;
    private lateinit var multicastLock:WifiManager.MulticastLock


    override fun load() {
       device = DeviceInterface(context.applicationContext.filesDir.absolutePath)
        val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        multicastLock = wifi.createMulticastLock("multicastLock")
    }

    enum class CallType {
        PERMISSIONS,
        SINGLE_UPDATE,
        DISCOVER,
        CONNECT,
    }

    @PluginMethod(returnType = PluginMethod.RETURN_CALLBACK)
    fun discoverDevices(call: PluginCall) {
        try {
            call.setKeepAlive(true)
            callQueue[call.callbackId] = CallType.DISCOVER
            multicastLock.acquire()
            nsdManager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
            discoveryListener = object : NsdManager.DiscoveryListener {
                override fun onDiscoveryStarted(regType: String) {
                    println("Service discovery started")
                }

                override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                    nsdManager.resolveService(serviceInfo, object : NsdManager.ResolveListener {
                        override fun onServiceResolved(info: NsdServiceInfo) {
                            val endpoint = "${info.serviceName}.local"
                            val result = JSObject()
                            result.put("endpoint", endpoint)
                            result.put("host", info.host.hostAddress)
                            call.resolve(result)
                        }

                        override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                            call.reject("Resolve failed with error code: $errorCode")
                        }
                    })
                }

                override fun onServiceLost(serviceInfo: NsdServiceInfo) {}

                override fun onDiscoveryStopped(serviceType: String) {}

                override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                    call.reject("Discovery failed with error code: $errorCode")
                }

                override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
            }

            nsdManager.discoverServices(type, NsdManager.PROTOCOL_DNS_SD, discoveryListener)
        } catch (e: Exception) {
            call.reject(e.toString())
        }
    }

    @PluginMethod
    fun stopDiscoverDevices(call: PluginCall) {
        val result = JSObject()
        try {
            val id = call.getString("id") ?: return call.reject("No Id Found")
            bridge.releaseCall(id)
            nsdManager.stopServiceDiscovery(discoveryListener)
            multicastLock.release()

            result.put("success", true)
            result.put("id", id)
            call.resolve(result)
        } catch (e: Exception) {
            result.put("success", false)
            result.put("message", e.message)
            call.resolve(result)
        }
    }

    @PluginMethod
    fun checkDeviceConnection(call: PluginCall) {
        device.checkDeviceConnection(pluginCall(call))
    }


    @PluginMethod(returnType = PluginMethod.RETURN_CALLBACK)
    fun connectToDeviceAP(call: PluginCall) {
        try {
            callQueue[call.callbackId] = CallType.DISCOVER
            call.setKeepAlive(true)
            val ssid = "bushnet"
            val password = "feathers"
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                call.setKeepAlive(true)
               // ask for permission
                val wifiSpecifier = WifiNetworkSpecifier.Builder()
                    .setSsid(ssid)
                    .setWpa2Passphrase(password)
                    .build()
                val networkRequest =NetworkRequest.Builder()
                    .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                    .setNetworkSpecifier(wifiSpecifier)
                    .build()


                cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
                cm!!.bindProcessToNetwork(null)
                val callback = object : ConnectivityManager.NetworkCallback() {
                    override fun onAvailable(network: Network) {
                        super.onAvailable(network)
                        wifiNetwork = network
                        cm!!.bindProcessToNetwork(network)
                        val result = JSObject()
                        result.put("success", true)
                        result.put("data", "connected")
                        call.resolve(result)
                    }
                    override fun onUnavailable() {
                        super.onUnavailable()
                        val result = JSObject()
                        wifiNetwork = null
                        result.put("success", false)
                        result.put("message", "Failed to connect to device AP")
                        call.resolve(result)
                        call.setKeepAlive(false)
                        bridge.releaseCall(call.callbackId)
                    }
                    override fun onLost(network: Network) {
                        super.onLost(network)
                        val result = JSObject()
                        result.put("success", true)
                        result.put("data", "disconnected")
                        cm!!.bindProcessToNetwork(null)
                        wifiNetwork = null
                        cm!!.unregisterNetworkCallback(this)
                        call.resolve(result)
                        call.setKeepAlive(false)
                        bridge.releaseCall(call.callbackId)
                    }
                }
                currNetworkCallback = callback
                cm!!.requestNetwork(networkRequest, callback)
            } else {
                connectToWifiLegacy(ssid, password, {
                    val result = JSObject()
                    result.put("success", true)
                    call.resolve(result)
                }, {
                    val result = JSObject()
                    result.put("success", false)
                    result.put("message", "Failed to connect to device AP")
                    call.resolve(result)
                })
            }
        } catch (e: Exception) {
            val result = JSObject()
            result.put("success", false)
            result.put("message", e.message)
            call.resolve(result)
        }
    }

    @ActivityCallback
    fun connectToWifi(call: PluginCall, result: ActivityResult) {
        if (result.resultCode == RESULT_OK) {
            val res= JSObject()
            res.put("success", true)
            res.put("data", "Connected to device AP")
            call.resolve(res)
        } else {
            val res = JSObject()
            res.put("success", false)
            res.put("message", "Failed to connect to device AP")
            call.resolve(res)
        }
    }

    @Suppress("DEPRECATION")
    private fun connectToWifiLegacy(ssid: String, password: String, onConnect: () -> Unit, onFail: () -> Unit) {
        val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager

        // Enable Wi-Fi if it's not enabled
        if (!wifiManager.isWifiEnabled) {
            wifiManager.isWifiEnabled = true
        }

        val wifiConfig = WifiConfiguration().apply {
            SSID = "\"" + ssid + "\""
            preSharedKey = "\"" + password + "\""
        }

        // Add the Wi-Fi configuration
        val networkId = wifiManager.addNetwork(wifiConfig)

        if (networkId != -1) {
            // Enable the network
            wifiManager.enableNetwork(networkId, true)

            // Reconnect to the network
            wifiManager.reconnect()
            onConnect()
        } else {
            onFail()
        }
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
    fun unbindConnection(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            while (cm?.boundNetworkForProcess != null) {
                cm?.bindProcessToNetwork(null)
            }
        }
        call.resolve()
    }

    @PluginMethod
    fun rebindConnection(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            cm?.bindProcessToNetwork(wifiNetwork)
        }
        call.resolve()
    }
}
