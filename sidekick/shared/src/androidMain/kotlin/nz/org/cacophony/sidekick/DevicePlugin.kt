package nz.org.cacophony.sidekick
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiConfiguration
import android.net.wifi.WifiManager
import android.net.wifi.WifiNetworkSpecifier
import android.os.Build
import androidx.annotation.RequiresApi
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import nz.org.cacophony.sidekick.device.DeviceInterface

class DevicePlugin(context: Context) : Plugin() {
    private val type = "_cacophonator-management._tcp."
    private val domain = "local."

    private lateinit var nsdManager: NsdManager
    private lateinit var discoveryListener: NsdManager.DiscoveryListener
    private var callQueue: MutableMap<String, CallType> = mutableMapOf()

    private val device = DeviceInterface(context.filesDir.absolutePath)

    enum class CallType {
        PERMISSIONS,
        SINGLE_UPDATE,
        DISCOVER
    }

    @PluginMethod
    fun discoverDevices(call: PluginCall) {
        call.setKeepAlive(true)
        callQueue[call.callbackId] = CallType.DISCOVER

        nsdManager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
        discoveryListener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(regType: String) {}

            override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                nsdManager.resolveService(serviceInfo, object : NsdManager.ResolveListener {
                    override fun onServiceResolved(info: NsdServiceInfo) {
                        val endpoint = "${info.serviceName}.${info.serviceType}@${info.host}:${info.port}"
                        val result = JSObject()
                        result.put("endpoint", endpoint)
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
    }

    @PluginMethod
    fun stopDiscoverDevices(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("No Id Found")
        bridge.releaseCall(id)
        nsdManager.stopServiceDiscovery(discoveryListener)

        val result = JSObject()
        result.put("success", true)
        result.put("id", id)
        call.resolve(result)
    }

    @PluginMethod
    fun checkDeviceConnection(call: PluginCall) {
        device.checkDeviceConnection(pluginCall(call))
    }

    @PluginMethod
    fun connectToDeviceAP(call: PluginCall) {
        val ssid = "bushnet"
        val password = "feathers"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            connectToWifi(ssid, password) {
                call.resolve(JSObject("{\"success\": true}"))
            }
        } else {
            connectToWifiLegacy(ssid, password, {
                call.resolve(JSObject("{\"success\": true}"))
            }, {
                call.reject("Failed to connect to device AP")
            })
        }
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    fun connectToWifi(ssid: String, password: String, onConnect: () -> Unit) {
        val wifiNetworkSpecifier = WifiNetworkSpecifier.Builder()
            .setSsid(ssid)
            .setWpa2Passphrase(password)
            .build()

        val networkRequest = NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .setNetworkSpecifier(wifiNetworkSpecifier)
            .build()

        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val networkCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: android.net.Network) {
                super.onAvailable(network)
                // You can now use the Wi-Fi network
                onConnect()
            }
        }

        connectivityManager.requestNetwork(networkRequest, networkCallback)
    }

    @Suppress("DEPRECATION")
    fun connectToWifiLegacy(ssid: String, password: String, onConnect: () -> Unit, onFail: () -> Unit) {
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
    fun getRecordings(call: PluginCall) {
        device.getRecordings(pluginCall(call))
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
}
