package nz.org.cacophony.sidekick

class Device(val name: String, val hostname: String, val port: Int)

class DeviceList {
    private val devices = sortedMapOf<String, Device>()
    private var onChanged: (() -> Unit)? = null

    @Synchronized
    fun add(d: Device) {
        devices[d.name] = d
        notifyChange()
    }

    @Synchronized
    fun remove(name: String) {
        if (devices.remove(name) != null) {
            notifyChange()
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

    private fun notifyChange() {
        onChanged?.invoke()
    }
}

