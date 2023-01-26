package nz.org.cacophony.sidekick.device

import io.ktor.client.*
import io.ktor.client.plugins.auth.*
import io.ktor.client.plugins.auth.providers.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.json.Json
import nz.org.cacophony.sidekick.CapacitorInterface
import nz.org.cacophony.sidekick.PluginCall
import nz.org.cacophony.sidekick.success

@Suppress("UNUSED")
class DeviceInterface : CapacitorInterface {
    val client = HttpClient {
        install(Auth) {
            basic {
                sendWithoutRequest { true }
                credentials { BasicAuthCredentials("admin", "feathers") }
            }
        }
        install(ContentNegotiation) {
            json(Json {
                prettyPrint = true
                ignoreUnknownKeys = true
            })
        }
    }

    private fun getDeviceFromCall(call: PluginCall) = validateCall(call, "url").map { (url) ->
        DeviceApi(client, Device(url))
    }
    fun getDeviceInfo(call: PluginCall) = runCatch(call) {
        getDeviceFromCall(call).map { deviceApi ->
            deviceApi.getDeviceInfo()
                .fold(
                    { error -> call.reject(error.toString()) },
                    { info ->
                        success(call,
                            mapOf(
                                "serverURL" to info.serverURL,
                                "groupName" to info.groupname,
                                "deviceName" to info.devicename,
                                "deviceID" to info.deviceID
                            )
                        )
                    }
                )
        }
    }

    fun getDeviceConfig(call: PluginCall) = runCatch(call) {
        getDeviceFromCall(call).map { deviceApi ->
            deviceApi.getConfig()
                .fold(
                    { error -> call.reject(error.toString()) },
                    { config -> success(call, config) }
                )
        }
    }

    fun setDeviceLocation(call: PluginCall) = runCatch(call) {
        getDeviceFromCall(call).map { deviceApi ->
            validateCall(call, "latitude", "longitude", "altitude", "accuracy", "timestamp")
                .map { (lat, long, alt, acc, time) ->
                    deviceApi.setLocation(Location(lat, long, alt, time, acc))
                        .fold(
                            { error -> call.reject("Unable to set location: $error Lat:$lat Long:$long Alt:$alt Acc:$acc time:$time") },
                            { success(call) },
                        )
                }
        }
    }

    fun getRecordings(call: PluginCall) = runCatch(call) {
        getDeviceFromCall(call).map { deviceApi ->
            deviceApi.getRecordings()
                .fold(
                    { error -> call.reject(error.toString()) },
                    { recordings -> success(call, recordings) }
                )
        }
    }

    fun getTestText(call: PluginCall) = runCatch(call) {
        call.resolve(mapOf("text" to "This is test text"))
    }
}