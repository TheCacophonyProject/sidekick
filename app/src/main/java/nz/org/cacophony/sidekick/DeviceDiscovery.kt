package nz.org.cacophony.sidekick

import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log

const val MANAGEMENT_SERVICE_TYPE = "_cacophonator-management._tcp"

class DiscoveryManager(private val nsdManager: NsdManager, private val devices: DeviceList ) {
    private var listener: DeviceListener? = null

    @Synchronized
    fun restart(clear: Boolean = false) {
        stopListener()
        if (clear) devices.clear()
        startListener()
    }

    @Synchronized
    fun stop() {
        stopListener()
    }

    private fun startListener() {
        Log.d(TAG, "Starting discovery")
        listener = DeviceListener(devices) { svc, lis -> nsdManager.resolveService(svc, lis) }
        nsdManager.discoverServices(MANAGEMENT_SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
    }

    private fun stopListener() {
        if (listener != null) {
            Log.d(TAG, "Stopping discovery")
            nsdManager.stopServiceDiscovery(listener)
            listener = null
        }
    }
}



class DeviceListener(
        private val devices: DeviceList,
        private val resolveService:(svc: NsdServiceInfo, lis: NsdManager.ResolveListener) -> Unit
): NsdManager.DiscoveryListener {

    override fun onDiscoveryStarted(regType: String) {
        Log.d(TAG, "Discovery started")
    }

    override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
        Log.e(TAG, "Discovery start failed with $errorCode")
    }

    override fun onDiscoveryStopped(serviceType: String) {
        Log.i(TAG, "Discovery stopped")
    }

    override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
        Log.e(TAG, "Discovery stop failed with $errorCode")
    }

    override fun onServiceFound(service: NsdServiceInfo) {
        Log.i(TAG, "Service found: $service")
        startResolve(service)
    }

    override fun onServiceLost(service: NsdServiceInfo) {
        Log.i(TAG, "Service lost: $service")
        devices.remove(service.serviceName)
    }

    private fun startResolve(service: NsdServiceInfo) {
        val resolveListener = object : NsdManager.ResolveListener {
            override fun onServiceResolved(svc: NsdServiceInfo?) {
                if (svc == null) return
                Log.i(TAG, "Resolved ${svc.serviceName}: ${svc.host.hostAddress}:${svc.port} (${svc.host.hostName})")
                devices.add(Device(svc.serviceName, svc.host.hostAddress, svc.port))
            }

            override fun onResolveFailed(svc: NsdServiceInfo?, errorCode: Int) {
                if (svc == null) return
                when (errorCode) {
                    NsdManager.FAILURE_ALREADY_ACTIVE -> startResolve(svc)
                            NsdManager.FAILURE_INTERNAL_ERROR -> Log.e(TAG, "FAILURE_INTERNAL_ERROR for resolution of ${svc}")
                    NsdManager.FAILURE_MAX_LIMIT -> Log.e(TAG, "FAILURE_MAX_LIMIT for resolution of ${svc}")
                    else -> Log.e(TAG, "Error {$errorCode} for resolution of ${svc}")
                }
            }
        }
        resolveService(service, resolveListener)
    }
}

