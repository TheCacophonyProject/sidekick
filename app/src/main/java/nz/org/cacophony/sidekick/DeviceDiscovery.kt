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
import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.util.Log
import net.posick.mDNS.Lookup
import org.xbill.DNS.DClass
import org.xbill.DNS.Resolver
import org.xbill.DNS.Type
import kotlin.concurrent.thread




const val MANAGEMENT_SERVICE_TYPE = "_cacophonator-management._tcp"

class DiscoveryManager(
        private val nsdManager: NsdManager,
        private val devices: DeviceList,
        private val activity: Activity,
        private val makeToast: (m: String, i: Int) -> Unit,
        private val setRefreshBar: (active: Boolean) -> Unit) {
    private var listener: DeviceListener? = null
    val wifi = activity.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    private var multicastLock = wifi.createMulticastLock("multicastLock")
    private var restarting: Boolean = false

    init {
        multicastLock.setReferenceCounted(false)
    }

    @Synchronized
    fun start() {
        var localList = listener
        if (localList != null && localList.connected) {
            return
        }
        restarting = false
        startListener()
    }

    @Synchronized
    fun restart(clear: Boolean = false) {
        restarting = true;
        var listenerFound = stopListener()
        if (clear) {
            val deviceMap = devices.getMap()
            for ((name, device) in deviceMap) {
                thread(start = true) {
                    device.checkConnectionStatus()
                    device.getDeviceInfo()
                    if (device.sm.state == DeviceState.ERROR_CONNECTING_TO_DEVICE) {
                        devices.remove(name)
                    }
                }
            }
        }
        if (!listenerFound) {
            startListener()
        }
    }

    @Synchronized
    fun stop() {
        restarting = false
        stopListener()
    }

    private fun startListener() {
        Log.d(TAG, "Starting discovery")
        multicastLock.acquire()
        setRefreshBar(true)
        listener = DeviceListener(devices, activity, makeToast, ::notifyDiscoveryStopped) { svc, lis -> nsdManager.resolveService(svc, lis) }
        nsdManager.discoverServices(MANAGEMENT_SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
        mdns();
    }

     fun mdns() {
        val lookup = Lookup(MANAGEMENT_SERVICE_TYPE, Type.ANY, DClass.IN);
        val services = lookup.lookupServices()
        for (service in services) {
            Log.d("MDNSS","Service $service")
        }
    }
    private fun stopListener(): Boolean {
        if (listener != null) {
            multicastLock.release()
            Log.d(TAG, "Stopping discovery")
            setRefreshBar(false)
            nsdManager.stopServiceDiscovery(listener)
            if (restarting == false) {
                listener = null
            }
            return true;
        }
        return false
    }

    private fun notifyDiscoveryStopped() {
        if (restarting) {
            startListener()
        }
    }
}

class DeviceListener(
        private val devices: DeviceList,
        private val activity: Activity,
        private val makeToast: (m: String, i: Int) -> Unit,
        private var onStopped: (() -> Unit)? = null,
        private val resolveService: (svc: NsdServiceInfo, lis: NsdManager.ResolveListener) -> Unit
) : NsdManager.DiscoveryListener {
    var connected: Boolean = false

    override fun onDiscoveryStarted(regType: String) {
        Log.d(TAG, "Discovery started")
        connected = true;
    }

    override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
        Log.e(TAG, "Discovery start failed with $errorCode")
        connected = false;
    }

    override fun onDiscoveryStopped(serviceType: String) {
        Log.i(TAG, "Discovery stopped")
        connected = false;
        activity.runOnUiThread {
            onStopped?.invoke()
        }
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
        devices.removeByName(service.serviceName)
    }

    private fun startResolve(service: NsdServiceInfo) {
        Log.d(TAG, "startResolve $service")

        val resolveListener = object : NsdManager.ResolveListener {
            override fun onServiceResolved(svc: NsdServiceInfo?) {
                if (svc == null) return
                Log.i(TAG, "Resolved ${svc.serviceName}: ${svc.host.hostAddress}:${svc.port} (${svc.host.hostName})")
                val db = RecordingRoomDatabase.getDatabase(activity.applicationContext)
                val recDao = db.recordingDao()
                val device = devices.getMap().get(svc.host.hostAddress)
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
                    if (newDevice.sm.state != DeviceState.ERROR_CONNECTING_TO_DEVICE) {
                        devices.add(newDevice)
                    }
                } else {
                    device.checkConnectionStatus()
                    if (device.sm.state.connected) {
                        Log.d(TAG, "Updating ${svc.host.hostAddress} host ${device.name} with name ${svc.serviceName}")
                        device.name = svc.serviceName;
                        device.getDeviceInfo()
                        device.updateRecordings()
                        devices.deviceNameUpdated()
                    } else {
                        devices.remove(svc.host.hostAddress) // Device service was still found but could not connect to device
                    }
                }

            }

            override fun onResolveFailed(svc: NsdServiceInfo?, errorCode: Int) {
                if (svc == null) return
                when (errorCode) {
                    NsdManager.FAILURE_ALREADY_ACTIVE -> {
                        Log.e(TAG, "FAILURE_ALREADY_ACTIVE for resolution of $svc")
                        startResolve(svc)
                    }
                    NsdManager.FAILURE_INTERNAL_ERROR -> Log.e(TAG, "FAILURE_INTERNAL_ERROR for resolution of $svc")
                    NsdManager.FAILURE_MAX_LIMIT -> Log.e(TAG, "FAILURE_MAX_LIMIT for resolution of $svc")
                    else -> Log.e(TAG, "Error {$errorCode} for resolution of $svc")
                }
            }
        }
        resolveService(service, resolveListener)
    }
}

