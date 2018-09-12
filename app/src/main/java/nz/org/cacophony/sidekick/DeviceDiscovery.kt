package nz.org.cacophony.sidekick

import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log

const val MANAGEMENT_SERVICE_TYPE = "_cacophonator-management._tcp"

class DeviceListener(private val nsdManager: NsdManager, private val devices: DeviceList): NsdManager.DiscoveryListener {

    fun startDiscovery() {
        nsdManager.discoverServices(MANAGEMENT_SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, this)
    }

    // Called as soon as service discovery begins.
    override fun onDiscoveryStarted(regType: String) {
        Log.d(TAG, "Service discovery started")
    }

    override fun onServiceFound(service: NsdServiceInfo) {
        // A service was found! Do something with it.
        Log.d(TAG, "Service discovery success: $service")
        nsdManager.resolveService(service, DeviceResolver(devices))
    }

    override fun onServiceLost(service: NsdServiceInfo) {
        Log.e(TAG, "service lost: $service")
        if (service.host == null) {
            return
        }
        devices.remove(toDevice(service))
    }

    override fun onDiscoveryStopped(serviceType: String) {
        Log.i(TAG, "Discovery stopped: $serviceType")
    }

    override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
        Log.e(TAG, "Discovery failed: Error code:$errorCode")
        nsdManager.stopServiceDiscovery(this)
    }

    override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
        Log.e(TAG, "Discovery failed: Error code:$errorCode")
        nsdManager.stopServiceDiscovery(this)
    }
}

class DeviceResolver(private val devices: DeviceList): NsdManager.ResolveListener {
    override fun onResolveFailed(service: NsdServiceInfo?, errorCode: Int) {
        Log.e(TAG, "Resolution failed: Error code:$errorCode")
    }

    override fun onServiceResolved(service: NsdServiceInfo?) {
        if (service == null) {
            return
        }
        Log.i(TAG, "Host: ${service.host}")
        Log.i(TAG, "Port: ${service.port}")
        devices.add(toDevice(service))
    }
}

fun toDevice(service: NsdServiceInfo) = Device(service.host.hostName, service.port)
