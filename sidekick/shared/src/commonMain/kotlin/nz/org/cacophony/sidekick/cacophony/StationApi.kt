package nz.org.cacophony.sidekick.cacophony

import arrow.core.Either
import arrow.core.flatMap
import io.ktor.client.statement.HttpResponse
import kotlinx.serialization.Serializable
import nz.org.cacophony.sidekick.*
class StationApi(val api: Api) {
    suspend fun getStations(token: Token): Either<ApiError, String> =
        api.getRequest("stations",token)
        .flatMap{ validateResponse(it)}

    @Serializable
    data class UpdateStation(val name : String)
    suspend fun updateStation(id: String, name: String, token: Token): Either<ApiError, String> =
        api.patchJSON("stations/$id",UpdateStation(name), token)
            .flatMap { validateResponse(it) }

}