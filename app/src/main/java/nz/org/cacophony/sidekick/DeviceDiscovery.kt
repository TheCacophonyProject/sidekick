package nz.org.cacophony.sidekick

import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log


class DeviceListener(private val nsdManager: NsdManager): NsdManager.DiscoveryListener {

    // Called as soon as service discovery begins.
    override fun onDiscoveryStarted(regType: String) {
        Log.d(TAG, "Service discovery started")
    }

    override fun onServiceFound(service: NsdServiceInfo) {
        // A service was found! Do something with it.
        Log.d(TAG, "Service discovery success: $service")
        nsdManager.resolveService(service, DeviceResolver())
    }

    override fun onServiceLost(service: NsdServiceInfo) {
        // When the network service is no longer available.
        // Internal bookkeeping code goes here.
        Log.e(TAG, "service lost: $service")
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

class DeviceResolver: NsdManager.ResolveListener {
    override fun onResolveFailed(service: NsdServiceInfo?, errorCode: Int) {
        Log.e(TAG, "Resolution failed: Error code:$errorCode")
    }

    override fun onServiceResolved(service: NsdServiceInfo?) {
        Log.i(TAG, "Host: ${service?.host}")
        Log.i(TAG, "Port: ${service?.port}")
    }
}
