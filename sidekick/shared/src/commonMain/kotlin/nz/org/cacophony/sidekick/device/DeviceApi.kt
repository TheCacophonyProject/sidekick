package nz.org.cacophony.sidekick.device

import arrow.core.*
import io.ktor.client.*
import io.ktor.client.request.forms.*
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
    override val basePath: String = device.url
    override val currentPath: String = "/api"

    suspend fun getDeviceInfo(): Either<ApiResult, DeviceInfo> =
        getRequest("device-info").flatMap { res ->
            validateResponse<String>(res)
                .flatMap {decodeToJSON(it)}
        }

    suspend fun getConfig(): Either<ApiResult, String> =
        getRequest("config")
            .flatMap{validateResponse(it)}

    suspend fun setLocation(location: Location): Either<ApiResult, String> =
        submitForm(childPath("location"), Parameters.build {
            append("latitude", location.latitude)
            append("longitude", location.longitude)
            append("altitude", location.altitude)
            append("timestamp", location.timestamp)
            append("accuracy", location.accuracy)
            }).flatMap{validateResponse(it)}

    suspend fun getRecordings(): Either<ApiResult, Array<String>> =
        getRequest("recordings")
            .flatMap{ validateResponse<String>(it).flatMap(::decodeToJSON) }

    suspend fun downloadFile(id: String): Either<ApiResult, ByteArray> =
        getRequest("download-file/$id")
            .flatMap { validateResponse(it) }
}