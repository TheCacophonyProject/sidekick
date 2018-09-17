/*
 * sidekick - Network discovery for Cacophony Project devices
 * Copyright (C) 2018, The Cacophony Project
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

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

