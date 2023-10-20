package nz.org.cacophony.sidekick.device

import arrow.core.flatMap
import arrow.core.maybe
import arrow.core.right
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

        install(ContentNegotiation) {
            json(Json {
                prettyPrint = true
                isLenient = true
                ignoreUnknownKeys = true
            })
        }
        install(HttpTimeout) {
            socketTimeoutMillis = 3000
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
}