package nz.org.cacophony.sidekick.device

import arrow.core.*
import io.ktor.client.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.client.statement.bodyAsChannel
import io.ktor.http.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

import nz.org.cacophony.sidekick.*
import okio.FileSystem
import okio.IOException
import okio.Path
import okio.buffer
import okio.use

private const val DOWNLOAD_BUFFER_SIZE = 8 * 1024

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

    suspend fun setConfig(section: String, config: String): Either<ApiError, String> =
        submitForm("config", Parameters.build {
            append("section", section)
            append("config", config)
        }).flatMap { validateResponse(it) }

    suspend fun setLowPowerMode(enabled: String): Either<ApiError, String> =
        submitForm("config", Parameters.build {
            append("section", "thermal-recorder")
            append("config", "{\"use-low-power-mode\":$enabled}")
        }).flatMap { validateResponse(it) }

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


    data class DownloadedFile(
        val path: Path,
        val size: Long,
        val contentType: String,
        val filename: String
    )

    suspend fun downloadFile(id: String, destinationDir: Path): Either<ApiError, DownloadedFile> =
        get("recording/$id") {
            headers {
                append(HttpHeaders.Authorization, token)
            }
        }.flatMap { response ->
            when (response.status) {
                HttpStatusCode.OK -> {
                    val contentType =
                        response.headers[HttpHeaders.ContentType] ?: "application/octet-stream"
                    val contentDisposition = response.headers[HttpHeaders.ContentDisposition]
                    val filename = contentDisposition?.let { parseFilename(it) } ?: "$id.bin"
                    val targetFile = destinationDir.resolve(filename)
                    Either.catch {
                        val channel = response.bodyAsChannel()
                        val parent = targetFile.parent
                        if (parent != null && !FileSystem.SYSTEM.exists(parent)) {
                            FileSystem.SYSTEM.createDirectory(parent, true)
                        }
                        if (FileSystem.SYSTEM.exists(targetFile)) {
                            FileSystem.SYSTEM.delete(targetFile, false)
                        }

                        var totalBytes = 0L
                        val buffer = ByteArray(DOWNLOAD_BUFFER_SIZE)
                        FileSystem.SYSTEM.sink(targetFile).buffer().use { sink ->
                            while (true) {
                                val read = channel.readAvailable(buffer, 0, buffer.size)
                                if (read == -1) break
                                if (read == 0) continue
                                sink.write(buffer, 0, read)
                                totalBytes += read
                            }
                        }

                        DownloadedFile(
                            path = targetFile,
                            size = totalBytes,
                            contentType = contentType,
                            filename = filename
                        )
                    }.mapLeft { throwable ->
                        when (throwable) {
                            is IOException -> HttpRequestError.create(
                                "File Write",
                                throwable.message ?: "Unable to write file to disk",
                                targetFile.toString()
                            )
                            else -> InvalidResponse.ParsingError("Error downloading file: ${throwable.message}")
                        }
                    }
                }
                else -> handleServerError(response).left()
            }
        }

    private fun parseFilename(contentDisposition: String): String {
        val filenameRegex = Regex("filename=\"?(.+?)\"?(?:;|$)")
        return filenameRegex.find(contentDisposition)?.groupValues?.get(1) ?: "unknown"
    }


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
