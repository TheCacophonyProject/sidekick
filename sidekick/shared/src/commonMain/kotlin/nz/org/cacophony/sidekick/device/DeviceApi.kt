package nz.org.cacophony.sidekick.device

import arrow.core.*
import io.ktor.client.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlinx.serialization.Serializable

import nz.org.cacophony.sidekick.*

@Serializable
data class DeviceInfo (
    val serverURL: String,
    val groupname: String,
    val devicename: String,
    val deviceID: Int,
)

@Serializable
data class Location (
    val latitude: String,
    val longitude: String,
    val altitude: String,
    val timestamp: String,
    val accuracy: String,
)

class DeviceApi(override val client: HttpClient, val device: Device): Api {
    override var basePath: String = device.url
    override val currentPath: String = "/api"
    val token = "Basic YWRtaW46ZmVhdGhlcnM="

    suspend fun getDevicePage(): Either<ApiError, String> =
        get(basePath) {
            headers {
                append(HttpHeaders.Authorization, token)
            }
        }.flatMap { validateResponse(it) }

    suspend fun getDeviceInfo(): Either<ApiError, String> =
        getRequest("device-info").flatMap { res ->
            validateResponse(res)
        }

    suspend fun getConfig(): Either<ApiError, String> =
        getRequest("config")
            .flatMap {validateResponse(it)}

    suspend fun getLocation(): Either<ApiError, String> =
        getRequest("location", token)
            .flatMap { validateResponse(it) }

    suspend fun setLocation(location: Location): Either<ApiError, String> =
        submitForm("location", Parameters.build {
            append("latitude", location.latitude)
            append("longitude", location.longitude)
            append("altitude", location.altitude)
            append("timestamp", location.timestamp)
            append("accuracy", location.accuracy)
            }).map {return validateResponse(it)}

    suspend fun getRecordings(): Either<ApiError, List<String?>> =
        getRequest("recordings", token)
            .flatMap { validateResponse<String>(it) }
            .flatMap(::decodeToJSON)

    suspend fun getEventKeys(): Either<ApiError, List<Int>> =
        getRequest("event-keys", token)
            .flatMap { validateResponse<String>(it) }
            .flatMap(::decodeToJSON)

    suspend fun getEvents(keys: String): Either<ApiError, String> =
        submitForm("events",Parameters.build {
            append("keys", keys)
        }, token, true)
            .flatMap { validateResponse(it) }

    suspend fun deleteEvents(keys: String): Either<ApiError, String> =
        delete("events") {
            url {
                parameters.append("keys", keys)
            }
            headers {
                append(HttpHeaders.Authorization, token)
            }
        }
            .flatMap { validateResponse(it) }

    suspend fun downloadFile(id: String): Either<ApiError, ByteArray> =
        get("recording/$id" ) {
            // response type is ByteArray
            headers {
                append(HttpHeaders.Authorization, token)
            }
        }
            .flatMap { validateResponse(it) }

    suspend fun connectToHost(
    ): Either<ApiError, HttpResponse> {
        return try {
            val res = client.get(device.url) {
                headers {
                    append(HttpHeaders.Authorization, token)
                }
            }
            return validateResponse(res)
        } catch (e: Exception) {
            InvalidResponse.ParsingError("Unable to connect to host: $e").left()
        }
    }

    suspend fun reregister(group: String, device: String): Either<ApiError, String> =
        submitForm("reregister",Parameters.build {
            append("name", device)
            append("group", group)
        }).flatMap { validateResponse(it) }

    suspend fun updateRecordingWindow(on: String, off: String): Either<ApiError, String> =
        submitForm("config", Parameters.build {
            append("section", "windows")
            append("config", "{\"power-on\":\"$on\",\"power-off\":\"$off\",\"start-recording\":\"$on\",\"stop-recording\":\"$off\"}")
        }).flatMap { validateResponse(it) }

    suspend fun updateWifiNetwork(ssid: String, password: String): Either<ApiError, String> =
        submitForm("wifi-networks", Parameters.build {
            append("ssid", ssid)
            append("psk", password)
        }).flatMap { validateResponse(it) }

    suspend fun turnOnModem(minutes: String): Either<ApiError, String> =
        submitForm("modem-stay-on-for", Parameters.build {
            append("minutes", minutes.toString())
        }).flatMap { validateResponse(it) }
}