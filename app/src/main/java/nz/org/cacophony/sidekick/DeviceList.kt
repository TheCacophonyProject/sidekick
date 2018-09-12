package nz.org.cacophony.sidekick

class Device(val hostname: String, val port: Int) : Comparable<Device> {
    val name: String = hostname.split(".")[0]

    override fun compareTo(other: Device): Int {
        return name.compareTo(other.name)
    }

    override fun hashCode(): Int {
        return this.name.hashCode()
    }
}

class DeviceList {
    private val devices = sortedSetOf<Device>()
    private var onChanged: (() -> Unit)? = null

    fun add(d: Device) {
        if (devices.add(d)) {
            notifyChange()
        }
    }

    fun remove(d: Device) {
        if (devices.remove(d)) {
            notifyChange()
        }
    }

    fun elementAt(i: Int) = devices.elementAt(i)

    val size get() = devices.size

    fun setOnChanged(onChanged: (() -> Unit)?) {
        this.onChanged = onChanged
    }

    private fun notifyChange() {
        onChanged?.invoke()
    }
}

