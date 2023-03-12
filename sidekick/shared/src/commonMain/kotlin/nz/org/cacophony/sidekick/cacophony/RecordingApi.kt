package nz.org.cacophony.sidekick.cacophony

import arrow.core.Either
import arrow.core.flatMap
import arrow.core.right
import arrow.core.rightIfNotNull
import getFile
import io.ktor.client.request.*
import io.ktor.client.request.forms.*
import io.ktor.http.*
import io.ktor.http.HttpHeaders.Authorization
import io.ktor.util.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import nz.org.cacophony.sidekick.*
import okio.ByteString.Companion.toByteString
import okio.Path

@kotlinx.serialization.Serializable
data class UploadRecordingResponse(val recordingId: Int, val success: Boolean,val messages: List<String>)

class RecordingApi(private val api: Api) {
    private fun getSha1FileHash(file: ByteArray): Either<ApiError, String> = Either.catch {
        val byteStr = file.toByteString()
        return byteStr.sha1().hex().right()
    }.mapLeft { ParsingError("Unable to get SHA1 hash for file $file: ${it.message}") }

    private fun encodeBase64(file: String): Either<ApiError, String> = Either.catch { return file.encodeBase64().right()}.mapLeft {
        ParsingError("Unable to encode file $file to base64: ${it.message}")
    }

    private fun getRecordingData(filename: Path): Either<ApiError, ByteArray> = getFile(filename)
        .rightIfNotNull { ParsingError("Unable to get file $filename") }

    @kotlinx.serialization.Serializable
    data class RecordingData(val type: String, val fileHash: String)

    suspend fun uploadRecording(file: Path, filename: String, device: String, token: Token, type: String): Either<ApiError,UploadRecordingResponse> =
        getRecordingData(file).flatMap { file ->
            getSha1FileHash(file).flatMap {
                api.post(
                    "recordings/device/${device}"
                ) {
                    headers {
                        append(Authorization, token)
                        contentType(ContentType.MultiPart.FormData)
                    }
                    setBody(
                        MultiPartFormDataContent(
                            formData {
                                append("file", file, Headers.build {
                                    append(
                                        HttpHeaders.ContentDisposition,
                                        "filename=${filename}"
                                    )
                                })
                                append(
                                    "data",
                                    Json.encodeToString(RecordingData(type, it)),
                                    Headers.build {
                                        append(HttpHeaders.ContentType, "application/json")
                                    })
                            },
                            boundary = "WebAppBoundary"

                        )
                    )
                }
                    .map {
                        println("Upload response: $it ${token}")
                        return validateResponse(it)
                    }.mapLeft {
                        FormError(
                            "Unable to upload recording for ${filename}: ${it.message}",
                            "device/${device}"
                        )
                    }
            }
        }

    @kotlinx.serialization.Serializable
    data class UploadEventResponse(val eventsAdded: Int, val eventDetailId: Int, val success: Boolean, val messages: List<String>)
    @kotlinx.serialization.Serializable
    data class UploadEventDescription(val type: String, val details: String)
    @kotlinx.serialization.Serializable
    data class UploadEventBody(val eventDetailId: Int, val dateTimes: List<String>, val description: UploadEventDescription )
    suspend fun uploadEvent(device: String, token: String, eventReq: UploadEventBody) : Either<ApiError, UploadEventResponse> {
        return api.post("events/device/${device}") {
            headers {
                append(Authorization, token)
                contentType(ContentType.Application.Json)
            }
            setBody(Json.encodeToString(eventReq))
        }.map {
            return validateResponse(it)
        }.mapLeft {
            FormError(
                "Unable to upload event for ${eventReq.eventDetailId}: ${it.message}",
                "device/${device}"
            )
        }
    }
}