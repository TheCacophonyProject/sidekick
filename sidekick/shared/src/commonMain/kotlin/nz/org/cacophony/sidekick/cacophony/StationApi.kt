package nz.org.cacophony.sidekick.cacophony

import arrow.core.Either
import arrow.core.flatMap
import arrow.core.left
import arrow.core.right
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentDisposition
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.Parameters
import io.ktor.http.auth.HttpAuthHeader
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import nz.org.cacophony.sidekick.*
import okio.Path

typealias ValidIsoString = String
class StationApi(val api: Api) {
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
    data class ReferenceImage(val fileKey: String)
    suspend fun uploadReferencePhoto(id: String, filePath: Path, token: Token): Either<ApiError, ReferenceImage> =
        getFile(filePath).map { image ->
            return api.submitForm("stations/$id/reference-photo", Parameters.build {
                append("file", image, Headers.build {
                    append(HttpHeaders.ContentType, "image/jpeg")
                })                append("data", "{}")
            }, token).flatMap { validateResponse(it) }
        }.mapLeft { InvalidResponse.UnknownError("Unable to get image for $filePath") }
}