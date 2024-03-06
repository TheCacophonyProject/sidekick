package nz.org.cacophony.sidekick.device

import arrow.core.flatMap
import io.ktor.client.*
import io.ktor.client.plugins.*
import io.ktor.client.plugins.auth.*
import io.ktor.client.plugins.auth.providers.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import nz.org.cacophony.sidekick.*
import okio.Path.Companion.toPath


@Suppress("UNUSED")
class DeviceInterface(private val filePath: String): CapacitorInterface {
    public val client = HttpClient {
        install(Auth) {
            basic {
                sendWithoutRequest { true }
                credentials { BasicAuthCredentials("admin", "feathers") }
            }
        }
        install(HttpTimeout) {
            connectTimeoutMillis = 3000
        }
        install(ContentNegotiation) {
            json(Json {
                prettyPrint = true
                isLenient = true
                ignoreUnknownKeys = true
            })
        }
    }
    private fun getDeviceFromCall(call: PluginCall) = call.validateCall<Device>("url").map { device ->
        DeviceApi(client, device)
    }

    fun getDeviceInfo(call: PluginCall) = runCatch(call) {
        getDeviceFromCall(call).map { deviceApi ->
            deviceApi.getDeviceInfo()
                .fold(
                    { error -> call.failure(error.toString()) },
                    { info ->
                        call.success(
                            info
                        )
                    }
                )
        }
    }

    fun getDeviceConfig(call: PluginCall) = runCatch(call) {
        getDeviceFromCall(call).map { deviceApi ->
            deviceApi.getConfig()
                .fold(
                    { error -> call.failure(error.toString()) },
                    { config -> call.success(config) }
                )
        }
    }

    fun getDeviceLocation(call: PluginCall) = runCatch(call) {
        getDeviceFromCall(call).map { deviceApi ->
            deviceApi.getLocation()
                .fold(
                    { error -> call.reject(error.toString())},
                    { call.success( it) }
                )
        }
    }

    fun setDeviceLocation(call: PluginCall) = runCatch(call) {
        getDeviceFromCall(call).map { deviceApi ->
            call.validateCall<Location>("latitude", "longitude", "altitude", "accuracy", "timestamp")
                .map { location ->
                    deviceApi.setLocation(location)
                        .fold(
                            { error -> call.failure("Unable to set location: $error $location") },
                            { call.success() },
                        )
                }
        }
    }

    fun getRecordings(call: PluginCall) = runCatch(call) {
        getDeviceFromCall(call).map { deviceApi ->
            deviceApi.getRecordings()
                .map { call.success(it) }
                .mapLeft { call.failure("Unable to retrieve recordings from ${deviceApi.device.url}: $it") }
        }
    }

    @Serializable
    data class EventCall(val keys: String)
    fun getEvents(call: PluginCall) = runCatch(call) {
        getDeviceFromCall(call).map { deviceApi ->
            call.validateCall<EventCall>("keys").map { eventCall ->
                deviceApi.getEvents(eventCall.keys).map {
                    call.success(it)
                }.mapLeft {
                    call.failure("Unable to retrieve events from ${deviceApi.device.url}: $it")
                }
            }
        }
    }

    fun deleteEvents(call: PluginCall) = runCatch(call) {
        getDeviceFromCall(call).map { deviceApi ->
            call.validateCall<EventCall>("keys").map { eventCall ->
                deviceApi.deleteEvents(eventCall.keys).map {
                    call.success(it)
                }.mapLeft {
                    call.failure("Unable to delete events from ${deviceApi.device.url}: $it")
                }
            }
        }
    }

    fun getEventKeys(call: PluginCall) = runCatch(call) {
        getDeviceFromCall(call).map { deviceApi ->
            deviceApi.getEventKeys()
                .map { call.success(it) }
                .mapLeft { call.failure("Unable to retrieve event keys from ${deviceApi.device.url}: $it") }
        }
    }



    @Serializable
    data class Recording(val recordingPath: String)
    fun downloadRecording(call: PluginCall) = runCatch(call) {
        getDeviceFromCall(call).map { deviceApi ->
            call.validateCall<Recording>( "recordingPath")
                .map { rec ->
                    deviceApi.downloadFile(rec.recordingPath)
                        .flatMap { file ->
                            writeToFile(filePath.toPath().resolve("recordings/${rec.recordingPath}"), file)
                                .map { call.success(mapOf("path" to it.toString(), "size" to file.size)) }
                                .mapLeft { call.failure("Unable to write file: $it") }
                        }
                        .mapLeft { call.failure("Unable to download file: $it") }
                }

        }
    }

    fun deleteRecordings(call: PluginCall) =
            deleteDirectory(filePath.toPath().resolve("recordings")).fold(
                { call.failure("Unable to delete recordings: $it") },
                { call.success() }
            )

    @Serializable
    data class RecordingToDelete(val recordingPath: String)
    fun deleteRecording(call: PluginCall) = runCatch(call) {
        call.validateCall<RecordingToDelete>("recordingPath")
            .map { rec ->
                deleteFile(filePath.toPath().resolve("recordings/${rec.recordingPath}"))
                    .fold(
                        { call.failure("Unable to delete recording: $it") },
                        { call.success() }
                    )
            }
    }

    fun getTestText(call: PluginCall) = runCatch(call) {
        call.resolve(mapOf("text" to "This is test text"))
    }

    fun checkDeviceConnection(call: PluginCall) = runCatch(call) {
        getDeviceFromCall(call)
            .map { deviceApi ->
                deviceApi.connectToHost()
                    .fold(
                        { error -> call.failure(error.toString()) },
                        {
                            call.success()
                        }
                    )
            }
    }

    fun getDevicePage(call: PluginCall) = runCatch(call) {
        getDeviceFromCall(call)
            .map { deviceApi ->
                deviceApi.getDevicePage()
                    .fold(
                        { error -> call.failure(error.toString()) },
                        {
                            call.success(it)
                        }
                    )
            }
    }

    @Serializable
    data class NewDevice(val group: String, val device: String)
    fun reregister(call: PluginCall) = runCatch(call) {
        getDeviceFromCall(call)
            .map { deviceApi ->
                call.validateCall<NewDevice>("group", "device")
                    .map { device ->
                        deviceApi.reregister(device.group, device.device)
                            .fold(
                                { error -> call.failure(error.toString()) },
                                {
                                    call.success()
                                }
                            )
                    }
            }
    }

@Serializable
data class RecordingWindow(val on: String, val off: String)
    fun updateRecordingWindow(call: PluginCall) = runCatch(call) {
        getDeviceFromCall(call)
            .map { deviceApi ->
                call.validateCall<RecordingWindow>("on", "off")
                    .map { window ->
                        deviceApi.updateRecordingWindow(window.on, window.off)
                            .fold(
                                { error -> call.failure(error.toString()) },
                                {
                                    call.success()
                                }
                            )
                    }
            }
    }

    @Serializable
    data class Wifi(val ssid: String, val password: String)
    fun updateWifi(call: PluginCall) = runCatch(call) {
        getDeviceFromCall(call)
            .map { deviceApi ->
                call.validateCall<Wifi>("ssid", "password")
                    .map { wifi ->
                        deviceApi.updateWifiNetwork(wifi.ssid, wifi.password)
                            .fold(
                                { error -> call.failure(error.toString()) },
                                {
                                    call.success()
                                }
                            )
                    }
            }
    }

    @Serializable
    data class TurnOnModem(val minutes: String)
    fun turnOnModem(call: PluginCall) = runCatch(call) {
        getDeviceFromCall(call)
            .map { deviceApi ->
                call.validateCall<TurnOnModem>("minutes")
                    .map { modem ->
                        deviceApi.turnOnModem(modem.minutes)
                            .fold(
                                { error -> call.failure(error.toString()) },
                                {
                                    call.success()
                                }
                            )
                    }
            }
    }
}