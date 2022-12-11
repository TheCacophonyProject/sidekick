
typealias Host = String
typealias Port = Int

data class Device(val hostname: Host, val port: Port)

fun getDevice(): String {
    val device = Device("tes", 3000)
    return device.hostname
}