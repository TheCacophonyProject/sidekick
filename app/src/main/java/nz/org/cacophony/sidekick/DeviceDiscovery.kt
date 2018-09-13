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
        Log.i(TAG, "Service found: $service")
        nsdManager.resolveService(service, DeviceResolver(devices))
    }

    override fun onServiceLost(service: NsdServiceInfo) {
        Log.i(TAG, "Service lost: $service")
        devices.remove(service.serviceName)
    }

    override fun onDiscoveryStopped(serviceType: String) {
        Log.i(TAG, "Discovery stopped: $serviceType")
    }

    override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
        Log.e(TAG, "Discovery start failed: Error code:$errorCode")
        nsdManager.stopServiceDiscovery(this)
    }

    override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
        Log.e(TAG, "Discovery stop failed: Error code:$errorCode")
        nsdManager.stopServiceDiscovery(this)
    }
}

class DeviceResolver(private val devices: DeviceList): NsdManager.ResolveListener {
    override fun onResolveFailed(service: NsdServiceInfo?, errorCode: Int) {
        Log.w(TAG, "Resolution failed: Error code:$errorCode")
    }

    override fun onServiceResolved(svc: NsdServiceInfo?) {
        if (svc == null) {
            return
        }
        Log.i(TAG, "Resolved ${svc.serviceName}: ${svc.host}:${svc.port}")
        devices.add(Device(svc.serviceName, svc.host.hostName, svc.port))
    }
}

