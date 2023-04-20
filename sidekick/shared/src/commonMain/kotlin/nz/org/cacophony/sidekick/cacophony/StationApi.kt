package nz.org.cacophony.sidekick.cacophony

import arrow.core.Either
import arrow.core.flatMap
import kotlinx.serialization.Serializable
import nz.org.cacophony.sidekick.*
import nz.org.cacophony.sidekick.device.Location

@Serializable
data class Settings (
    val referenceImages: List<String>
    )
@Serializable
data class Station (
    val id: Int,
    val name: String,
    val location: Location,
    val lastUpdatedById: Int,
    val createdAt: String,
    val activeAt: String,
    val retiredAt: String,
    val lastThermalRecordingTime: String,
    val lastAudioRecordingTime: String,
    val lastActiveThermalTime: String,
    val lastActiveAudioTime: String,
    val automatic: Boolean,
    val settings: Settings,
    val needsRename: Boolean,
    val updatedAt: String,
    val groupId: Int,
    val groupName: String
)
typealias StationList = List<Station>
@Serializable
data class StationResponse (
    val stations: StationList,
    val success: Boolean,
    val messages: List<String>
    )
class StationApi(val api: Api) {
    suspend fun getStations(token: Token): Either<ApiError, StationList> =
        api.getRequest("stations",token)
        .flatMap { validateResponse(it) }
}