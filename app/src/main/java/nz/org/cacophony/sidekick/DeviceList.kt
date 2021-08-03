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

import kotlin.concurrent.thread

class DeviceList {
    private val devices = sortedMapOf<String, Device>()
    private var onChanged: (() -> Unit)? = null

    @Synchronized
    fun add(d: Device) {
        devices[d.hostname] = d
        notifyChange()
    }

    @Synchronized
    fun deviceNameUpdated() {
        notifyChange()
    }

    @Synchronized
    fun remove(name: String) {
        if (devices.remove(name) != null) {
            notifyChange()
        }
    }

    @Synchronized
    fun removeByName(serviceName: String) {
        for ((hostname, device) in devices) {
            if (device.name == serviceName) {
                devices.remove(hostname)
                notifyChange()
                break
            }
        }
    }

    @Synchronized
    fun clear() {
        val hadItems = devices.size > 0
        devices.clear()
        if (hadItems) notifyChange()
    }

    @Synchronized
    fun elementAt(i: Int): Device {
        return devices.values.elementAt(i)
    }

    @Synchronized
    fun size(): Int {
        return devices.size
    }

    @Synchronized
    fun setOnChanged(onChanged: (() -> Unit)?) {
        this.onChanged = onChanged
    }

    @Synchronized
    fun getOnChanged(): ((() -> Unit)?) {
        return this.onChanged
    }

    fun notifyChange() {
        for ((_, device) in devices) {
            thread{
                device.updateStatus()
            }
        }
        onChanged?.invoke()
    }

    @Synchronized
    fun getMap(): Map<String, Device> {
        return devices
    }
}

