package nz.org.cacophony.sidekick.cacophony

import arrow.core.Either
import arrow.core.flatMap
import arrow.core.left
import arrow.core.right
import io.ktor.client.call.body
import io.ktor.client.plugins.onUpload
import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.client.request.forms.formData
import io.ktor.client.request.forms.submitFormWithBinaryData
import io.ktor.client.request.headers
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentDisposition
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.Parameters
import io.ktor.http.auth.HttpAuthHeader
import io.ktor.http.content.PartData
import io.ktor.http.headersOf
import io.ktor.utils.io.ByteReadChannel
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import nz.org.cacophony.sidekick.*
import okio.Path
import okio.Path.Companion.toPath

typealias ValidIsoString = String
class StationApi(val api: CacophonyApi, val filePath: String) {
    suspend fun getStations(token: Token): Either<ApiError, String> =
        api.getRequest("stations",token)
        .flatMap{ validateResponse(it)}

    @Serializable
    data class UpdateStation(val name : String)
    @Serializable
    data class UpdateStationJSON(@SerialName("station-updates") val stationUpdates: String)
    suspend fun updateStation(id: String, name: String, token: Token): Either<ApiError, String> =
        api.patchJSON("stations/$id",UpdateStationJSON(Json.encodeToString(mapOf("name" to name))), token)
            .flatMap { validateResponse(it) }
    private fun validateIsoString(isoString: String): Either<ApiError, ValidIsoString> = try {
        isoString.right()
    } catch (e: Exception) {
        InvalidResponse.ParsingError("Invalid date format: $isoString").left()
    }

    @Serializable
    data class CreateStation(val name : String, val lat : Double, val lon : Double, @SerialName("from-date") val fromDate: ValidIsoString)
    suspend fun createStation(name: String, lat: Double, lon: Double, fromDate: String, groupName: String, token: Token): Either<ApiError, String> =
        validateIsoString(fromDate).flatMap { fromDate->
            api.postJSON("groups/$groupName/station", CreateStation(name, lat, lon, fromDate), token)
                .flatMap { validateResponse(it) }
        }

    @Serializable
    data class ReferenceImage(val fileKey: String, val messages: List<String>, val success: Boolean)
    suspend fun uploadReferencePhoto(id: String, filePath: Path, token: Token): Either<InvalidResponse, ReferenceImage> =
        getFile(filePath).map { image ->
            val url = "${api.browsePath}/stations/$id/reference-photo"
            val res = api.client.submitFormWithBinaryData(
                url = url,
               formData = formData {
                    append("file", image, Headers.build {
                        append(HttpHeaders.ContentDisposition,"form-data; name=\"file\"; filename=\"blob\"")
                        append(HttpHeaders.ContentType, "image/jpeg")
                    })
                    append("data", "{}")
                }
               ) {
                headers {
                    append(HttpHeaders.ContentType, "multipart/form-data")
                    append(HttpHeaders.Authorization, token)
                }
            }
            return validateResponse(res)
        }.mapLeft { InvalidResponse.UnknownError("Unable to get image for $filePath") }
    @Serializable
    data class GetReferenceImage(val success: Boolean)
    suspend fun getReferencePhoto(id: String, fileKey: String, token: Token): Either<InvalidResponse, String>  {
        try {
            val path = filePath.toPath().resolve("cache/${fileKey}")
            return if (hasFile(path)) {
                path.toString().right()
            } else {
                api.getRequest("stations/$id/reference-photo/${fileKey}", token)
                    .flatMap { validateResponse<ByteArray>(it) }
                    .flatMap {
                        writeToFile(filePath.toPath().resolve("cache/${fileKey}"), it)
                            .map { path ->
                                path.toString()
                            }
                            .mapLeft { err ->
                                InvalidResponse.UnknownError("Unable to write image for $fileKey: $err")
                            }
                    }
                    .mapLeft { InvalidResponse.UnknownError("Unable to get reference photo for $id: $it") }
            }
        } catch (e: Exception) {
            return fileKey.right()
        }
    }

    @Serializable
    data class DeleteResponse(val success: Boolean)
    @Serializable
    data class DeletedReference(val localDeleted: Boolean, val serverDeleted: Boolean)
    suspend fun deleteReferencePhoto(id: String, fileKey: String, token: Token): Either<InvalidResponse, DeletedReference>  {
        val path = filePath.toPath().resolve("cache/${fileKey}")
        return api.deleteRequest("stations/$id/reference-photo/$fileKey", token)
            .flatMap { res ->
                validateResponse<DeleteResponse>(res).map {
                return deleteFile(path).fold(
                    { InvalidResponse.UnknownError("Unable to delete reference photo for $id: $it").left() },
                    { DeletedReference(localDeleted = true, serverDeleted = true).right() }
                )
            } }
            .mapLeft {
                return deleteFile(path).fold(
                    { InvalidResponse.UnknownError("Unable to delete reference photo for $id: $it").left() },
                    { DeletedReference(localDeleted = true, serverDeleted = false).right() }
                )
            }


    }
}