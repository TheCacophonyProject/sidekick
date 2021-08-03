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
import nz.org.cacophony.sidekick.db.RoomDatabase
import org.xbill.DNS.DClass
import org.xbill.DNS.Type
import java.net.*
import java.util.*
import kotlin.concurrent.thread

const val MANAGEMENT_SERVICE_TYPE = "_cacophonator-management._tcp"
const val SCANNING_DURATION = 20000

class DiscoveryManager(
        private val nsdManager: NsdManager,
        private val devices: DeviceList,
        private val activity: Activity,
        private val messenger: Messenger,
        private val db: RoomDatabase,
        private val mainViewModel: MainViewModel) {
    private var listener: DeviceListener? = null
    private val wifi = activity.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    private var multicastLock = wifi.createMulticastLock("multicastLock")
    private var restarting: Boolean = false
    private var stopScanAt: Calendar? = null

    init {
        multicastLock.setReferenceCounted(false)
    }

    @Synchronized
    fun start() {
        val localList = listener
        if (localList != null && localList.connected) {
            return
        }
        restarting = false
        startListener()
    }

    @Synchronized
    fun restart(clear: Boolean = false) {
        restarting = true
        val listenerFound = stopListener()

        if (clear) {
            clearDevices()
        }

        if (listenerFound) {
            listener?.updateConnected()
        } else {
            startListener()
        }
    }

    @Synchronized
    fun clearDevices() {
        devices.clear()
    }

    @Synchronized
    fun stop() {
        restarting = false
        stopListener()
    }

    private fun startListener() {
        Log.d(TAG, "Starting discovery")
        val cal: Calendar = Calendar.getInstance()
        cal.add(Calendar.MILLISECOND, SCANNING_DURATION)
        stopScanAt = cal
        thread {
            Thread.sleep(SCANNING_DURATION.toLong() + 100)
            val now = Calendar.getInstance()
            if (stopScanAt != null && stopScanAt!! <= now) {
                stopScanAt = null
                stop()
            }
        }
        mainViewModel.scanning.postValue(true)
        multicastLock.acquire()
        listener = DeviceListener(devices, activity, messenger, ::notifyDiscoveryStopped, db, mainViewModel) { svc, lis -> nsdManager.resolveService(svc, lis) }
        nsdManager.discoverServices(MANAGEMENT_SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
    }


    private fun stopListener(): Boolean {
        mainViewModel.scanning.postValue(false)
        if (listener != null) {
            multicastLock.release()
            Log.d(TAG, "Stopping discovery")
            nsdManager.stopServiceDiscovery(listener)
            if (!restarting) {
                listener = null
            }
            return true
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
        private val messenger: Messenger,
        private var onStopped: (() -> Unit)? = null,
        private val db: RoomDatabase,
        private val mainViewModel: MainViewModel,
        private val resolveService: (svc: NsdServiceInfo, lis: NsdManager.ResolveListener) -> Unit
) : NsdManager.DiscoveryListener {
    var connected: Boolean = false

    init {
        updateConnected()
    }

    override fun onDiscoveryStarted(regType: String) {
        Log.d(TAG, "Discovery started")
        connected = true
    }

    override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
        Log.e(TAG, "Discovery start failed with $errorCode")
        connected = false
    }

    override fun onDiscoveryStopped(serviceType: String) {
        Log.i(TAG, "Discovery stopped")
        connected = false
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


    fun updateConnected() {
        thread(start = true) {
            val lookup = Lookup(MANAGEMENT_SERVICE_TYPE, Type.ANY, DClass.IN)
            val services = lookup.lookupServices()
            for (service in services) {
                val addresses = service.addresses
                var deviceAddress: InetAddress? = null
                for (address in addresses) {
                    if (deviceAddress == null && address is Inet6Address) {
                        deviceAddress = address
                    } else if (address is Inet4Address) {

                        deviceAddress = address
                    }
                }

                if (deviceAddress != null) {
                    Log.d(TAG, "updateConnected Service ${service.name.instance} service port ${service.port} address ${deviceAddress.hostAddress}")
                    deviceConnected(service.name.instance, deviceAddress.hostAddress, service.port)
                }
            }
        }
    }


    private fun checkConnectionStatus(hostname: String, timeout: Int = 3000, retries: Int = 3): Boolean {
        var connected = false
        for (i in 1..retries) {
            try {
                val conn = URL("http://$hostname").openConnection() as HttpURLConnection
                conn.connectTimeout = timeout
                conn.readTimeout = timeout
                conn.responseCode
                conn.disconnect()
                connected = true
                Log.d(TAG, "Connected!!")
                break
            } catch (e: SocketException) {
                Log.i(TAG, "failed to connect to device")
            } catch (e: ConnectException) {
                Log.i(TAG, "failed to connect to interface")
            } catch (e: Exception) {
                Log.e(TAG, "failed connecting to device $e")
            }
            if (i != retries) {
                Thread.sleep(3000)
            }
        }
        return connected
    }

    fun deviceConnected(serviceName: String, hostAddress: String, port: Int) {
        if (!checkConnectionStatus(hostAddress, retries = 1)) {
            devices.remove(hostAddress)
            return
        }
        Log.i(TAG, "deviceConnected ${serviceName}: ${hostAddress}:${port}")
        val device = devices.getMap()[hostAddress]
        if (device == null) {
            val newDevice = Device(
                    serviceName,
                    hostAddress,
                    port,
                    activity,
                    devices.getOnChanged(),
                    messenger,
                    db,
                    mainViewModel)
            //TODO look into why a service could be found for a device when is wasn't connected (device was unplugged but service was still found..)
            devices.add(newDevice)

        } else {
            device.checkConnectionStatus()
            if (device.sm.state.connected) {
                Log.d(TAG, "Updating $hostAddress host ${device.name} with name $serviceName")
                device.name = serviceName
                device.getDeviceInfo()
                device.checkDataOnDevice()
                devices.deviceNameUpdated()
            } else {
                devices.remove(hostAddress) // Device service was still found but could not connect to device
            }
        }
    }

    private fun startResolve(service: NsdServiceInfo) {
        Log.d(TAG, "startResolve $service")

        val resolveListener = object : NsdManager.ResolveListener {
            override fun onServiceResolved(svc: NsdServiceInfo?) {
                if (svc != null) {
                    deviceConnected(svc.serviceName, svc.host.hostAddress, svc.port)
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

