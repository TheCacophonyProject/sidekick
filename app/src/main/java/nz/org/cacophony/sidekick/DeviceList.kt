package nz.org.cacophony.sidekick

class Device(val name: String, val hostname: String, val port: Int)

// FIXME: suspect this needs to be thread-safe
class DeviceList {
    private val devices = sortedMapOf<String, Device>()
    private var onChanged: (() -> Unit)? = null

    fun add(d: Device) {
        devices[d.name] = d
        notifyChange()
    }

    fun remove(name: String) {
        if (devices.remove(name) != null) {
            notifyChange()
        }
    }

    fun clear() {
        val hadItems = devices.size > 0
        devices.clear()
        if (hadItems) notifyChange()
    }

    fun elementAt(i: Int): Device {
        return devices.values.elementAt(i)
    }

    val size get() = devices.size

    fun setOnChanged(onChanged: (() -> Unit)?) {
        this.onChanged = onChanged
    }

    private fun notifyChange() {
        onChanged?.invoke()
    }
}

