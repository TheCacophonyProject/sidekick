package nz.org.cacophony.sidekick.`interface`

import nz.org.cacophony.sidekick.network.Discovery

class DeviceInterface {
    val discovery = Discovery("_cacophonator-management._tcp")
    fun discoverDevices(call: PluginCall) {
        print("testt")
        call.setKeepAlive(true)
        discovery.discoverDevices { device ->
            call.resolve(mapOf("hostname" to "test", "port" to "test"))
        }.mapLeft { error ->
            call.reject(error.toString())
        }
    }
}