package nz.org.cacophony.sidekick.cacophony

import arrow.core.Either
import kotlinx.serialization.Serializable
import nz.org.cacophony.sidekick.*
import okio.Path.Companion.toPath

@Suppress("UNUSED")
data class CacophonyInterface(val filePath: String): CapacitorInterface {
    val api = CacophonyApi()
    private val userApi = UserApi(api)
    private val recordingApi = DeviceApi(api)
    private val stationApi = StationApi(api)

    @Serializable
    data class User(val email: String, val password: String)
    fun authenticateUser(call: PluginCall) = runCatch(call) {
        call.validateCall<User>("email", "password").map { (email, password) ->
                userApi.authenticateUser(email, password)
                    .fold(
                        { error -> call.failure(error.toString()) },
                        { authUser ->
                            val resolvedObj = mapOf(
                                "id" to authUser.id.toString(),
                                "email" to authUser.email,
                                "token" to authUser.token.token,
                                "refreshToken" to authUser.token.refreshToken,
                            )
                            call.success(resolvedObj)
                        }
                    )
            }
        }
    private fun getTokenFromCall(call: PluginCall): Either<Unit, AuthToken> = call.validateCall<AuthToken>("token", "refreshToken", "expiry")
        .mapLeft { call.reject("Invalid arguments for token $it") }

    data class RequestDeletion(val token: String)
    fun requestDeletion(call: PluginCall) = runCatch(call) {
        call.validateCall<RequestDeletion>("token").map { (token) ->
            userApi.requestDeletion(token)

                .fold(
                    { error -> call.failure(error.toString()) },
                    { call.success() }
                )
        }
    }

    fun validateToken(call: PluginCall) = runCatch(call) {
        getTokenFromCall(call).map { token ->
            userApi.validateToken(token)
                .fold(
                    { error -> call.failure(error.toString()) },
                    { authUser ->
                        call.success(mapOf(
                            "token" to authUser.token,
                            "refreshToken" to authUser.refreshToken,
                            "expiry" to authUser.expiry,
                        ))
                    }
                )
        }
    }

    @Serializable
    data class Recording(val token: String, val device: String, val type: String, val filename: String)
    fun uploadRecording(call: PluginCall) = runCatch(call) {
        call.validateCall<Recording>("token", "device","type", "filename").map { recording ->
                println("$recording")
                recordingApi.uploadRecording(
                    filePath.toPath().resolve("recordings/${recording.filename}"), recording.filename, recording.device, recording.token, recording.type)
                    .fold(
                        { error -> call.failure(error.toString()) },
                        { call.success(mapOf("recordingId" to it.recordingId, "messages" to it.messages)) }
                    )
        }
    }

    @Serializable
    data class UploadEventCall(val token: String, val device: String, val eventId: String, val type: String, val details: String, val timeStamp: String)
    fun uploadEvent(call: PluginCall) = runCatch(call) {
        call.validateCall<UploadEventCall>("token", "device", "eventId", "type", "details", "timeStamp").map { event ->
            recordingApi.uploadEvent( event.device,event.token, listOf(event.timeStamp), event.type, event.details)
                .fold(
                    { error -> call.failure(error.toString()) },
                    { call.success(mapOf(
                       "eventDetailId" to it.eventDetailId,
                        "eventsAdded" to it.eventsAdded,
                        "messages" to it.messages
                    )) }
                )
        }
    }

    @Serializable
    data class GetDeviceByIdCall(val token: String, val id: String)
    fun getDeviceById(call: PluginCall) = runCatch(call) {
        call.validateCall<GetDeviceByIdCall>("token", "id").map { device ->
            recordingApi.getDeviceById(device.id, device.token)
                .fold(
                    { error -> call.failure(error.toString()) },
                    { call.success(it) }
                )
        }
    }

    @Serializable
    data class GetStationsForUserCall(val token: String)
    fun getStationsForUser(call: PluginCall) = runCatch(call) {
        call.validateCall<GetStationsForUserCall>("token").map { stations ->
            stationApi.getStations(stations.token)
                .fold(
                    { error -> call.failure(error.toString()) },
                    { call.success(it) }
                )
        }
    }

    @Serializable
    data class UpdateStationCall(val token: String, val id: String, val name: String)
    fun updateStation(call: PluginCall) = runCatch(call) {
        call.validateCall<UpdateStationCall>("token", "id", "name").map { station ->
            stationApi.updateStation(station.id, station.name, station.token)
                .fold(
                    { error -> call.failure(error.toString()) },
                    { call.success(it) }
                )
        }
    }

    fun setToTestServer(call: PluginCall) = runCatch(call) {
        api.setToTest();
        call.success()
    }

    fun setToProductionServer(call: PluginCall) = runCatch(call) {
        api.setToProd();
        call.success()
    }
}