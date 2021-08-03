package nz.org.cacophony.sidekick.db

import androidx.lifecycle.LiveData
import androidx.room.*

@Entity(tableName = "event")
data class Event(
    @ColumnInfo(name = "device_id") val deviceID: Int,
    @ColumnInfo(name = "event_id") val eventID: Int,
    @ColumnInfo(name = "timestamp") val timestamp: String,
    @ColumnInfo(name = "type") val type: String,
    @ColumnInfo(name = "details") val details: String
) {
    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "id") var id: Int = 0

    @ColumnInfo(name = "uploaded") var uploaded: Boolean = false

    override fun toString(): String {
        return "Event; id: $id, deviceID: $deviceID, eventID: $eventID, type: $type, timestamp: $timestamp, uploaded: $uploaded, details: $details"
    }
}

@Dao
interface EventDao {
    @Query("SELECT * FROM event WHERE device_id = (:deviceID)")
    fun getAllForDevice(deviceID: Int): List<Event>

    @Query("SELECT * FROM event WHERE NOT uploaded AND id NOT IN (:excludeIDs) LIMIT 1")
    fun getOneNotUploaded(excludeIDs: List<Int>): Event?

    @Query("SELECT * FROM event WHERE device_id = (:deviceID) AND type = (:type) AND details = (:details) AND NOT uploaded")
    fun getSimilarToUpload(deviceID: Int, type: String, details: String): List<Event>

    @Query("SELECT * FROM event WHERE device_id = (:deviceID) AND event_id = (:eventID) LIMIT 1")
    fun getDeviceEvent(deviceID: Int, eventID: Int): Event?

    @Query("SELECT event_id FROM event WHERE device_id = (:deviceID)")
    fun getDeviceEventIDs(deviceID: Int): List<Int>

    @Query("SELECT event_id FROM event WHERE device_id = :deviceID AND NOT uploaded")
    fun getDeviceEventIDsNotUploaded(deviceID: Int): List<Int>

    @Query("SELECT * FROM event WHERE NOT UPLOADED")
    fun getEventsToUpload(): List<Event>

    @Query("SELECT * FROM event WHERE device_id = (:deviceID)")
    fun getDeviceEvents(deviceID: Int): List<Event>

    @Query("SELECT event_id FROM event WHERE uploaded AND device_id = :deviceID")
    fun getUploadedFromDevice(deviceID: Int): List<Int>

    @Query("UPDATE event SET uploaded = 1 WHERE id = :id")
    fun setAsUploaded(id: Int)

    @Query("SELECT * from event")
    fun getEventLiveData(): LiveData<List<Event>>

    @Query("SELECT * from event")
    fun getAllEvents(): List<Event>

    @Insert
    fun insertAll(vararg events: Event)

    @Delete
    fun delete(event: Event)
}