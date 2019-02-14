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

import android.app.Activity
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log
import kotlin.concurrent.thread

const val MANAGEMENT_SERVICE_TYPE = "_cacophonator-management._tcp"

class DiscoveryManager(
        private val nsdManager: NsdManager,
        private val devices: DeviceList,
        private val activity: Activity,
        private val makeToast: (m: String, i : Int) -> Unit,
        private val setRefreshBar: (active : Boolean) -> Unit) {
    private var listener: DeviceListener? = null

    @Synchronized
    fun restart(clear: Boolean = false) {
        stopListener()
        if (clear) {
            val deviceMap = devices.getMap()
            for ((name, device) in deviceMap) {
                thread(start = true) {
                    device.checkConnectionStatus()
                    if (device.sm.state == DeviceState.ERROR_CONNECTING_TO_DEVICE) {
                        devices.remove(name)
                    }
                }
            }
        }
        startListener()
    }

    @Synchronized
    fun stop() {
        stopListener()
    }

    private fun startListener() {
        Log.d(TAG, "Starting discovery")
        setRefreshBar(true)
        listener = DeviceListener(devices, activity, makeToast) { svc, lis -> nsdManager.resolveService(svc, lis) }
        nsdManager.discoverServices(MANAGEMENT_SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
    }

    private fun stopListener() {
        if (listener != null) {
            Log.d(TAG, "Stopping discovery")
            setRefreshBar(false)
            nsdManager.stopServiceDiscovery(listener)
            listener = null
        }
    }
}

class DeviceListener(
        private val devices: DeviceList,
        private val activity: Activity,
        private val makeToast: (m: String, i : Int) -> Unit,
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
                val db = RecordingRoomDatabase.getDatabase(activity.applicationContext)
                val recDao = db.recordingDao()
                val device = devices.getMap().get(svc.serviceName)
                if (device == null) {
                    val newDevice = Device(
                            svc.serviceName,
                            svc.host.hostAddress,
                            svc.port,
                            activity,
                            devices.getOnChanged(),
                            makeToast,
                            recDao)
                    //TODO look into why a service could be found for a device when is wasn't connected (device was unplugged but service was still found..)
                    newDevice.checkConnectionStatus()
                    if (newDevice.sm.state != DeviceState.ERROR_CONNECTING_TO_DEVICE) {
                        devices.add(newDevice)
                    }
                } else  {
                    device.checkConnectionStatus()
                    if (device.sm.state.connected) {
                        device.updateRecordings()
                    } else {
                        devices.remove(svc.serviceName) // Device service was still found but could not connect to device
                    }
                }
            }

            override fun onResolveFailed(svc: NsdServiceInfo?, errorCode: Int) {
                if (svc == null) return
                when (errorCode) {
                    NsdManager.FAILURE_ALREADY_ACTIVE -> startResolve(svc)
                            NsdManager.FAILURE_INTERNAL_ERROR -> Log.e(TAG, "FAILURE_INTERNAL_ERROR for resolution of $svc")
                    NsdManager.FAILURE_MAX_LIMIT -> Log.e(TAG, "FAILURE_MAX_LIMIT for resolution of $svc")
                    else -> Log.e(TAG, "Error {$errorCode} for resolution of $svc")
                }
            }
        }
        resolveService(service, resolveListener)
    }
}

