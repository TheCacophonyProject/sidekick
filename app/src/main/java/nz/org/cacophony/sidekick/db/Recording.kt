package nz.org.cacophony.sidekick.db

import androidx.lifecycle.LiveData
import androidx.room.*

/**
 * This table stores all the recordings downloaded from devices.
 * The lifecycle of recordings should be something like...
 * - Download recording from device, add entry to DB. Recording is NOT deleted from the device here.
 * - Recording gets uploaded to the CacophonyAPI at a later date.
 * - When reconnecting to the device that the recording originated from, delete the recording on the
 *      device then from this table.
 */
@Entity(tableName = "recording",  indices = [Index(value = ["recording_path"], unique = true)])
class Recording(
        @ColumnInfo(name = "device_name") var deviceName: String,
        @ColumnInfo(name = "recording_path") var recordingPath: String,
        @ColumnInfo(name = "name") var name: String,
        @ColumnInfo(name = "group_name") var groupName: String?,
        @ColumnInfo(name = "device_id") var deviceID: Int) {

    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "id")
    var id: Int? = null

    @ColumnInfo(name = "uploaded")
    var uploaded = false

    @ColumnInfo(name = "size")
    var size: Int? = null

    override fun toString(): String {
        return "Recording; name: $name, device: $deviceName, uploaded: $uploaded }"
    }
}

@Dao
interface RecordingDao {
    // LiveData is a data holder class that can be observed within a given lifecycle.
    // Always holds/caches latest version of data. Notifies its active observers when the
    // data has changed. Since we are getting all the contents of the database,
    // we are notified whenever any of the database contents have changed.
    //@Query("SELECT * from Recording ORDER BY word ASC")
    //LiveData<List<Recording>> getAlphabetizedWords();

    // We do not need a conflict strategy, because the word is our primary key, and you cannot
    // add two items with the same primary key to the database. If the table has more than one
    // column, you can use @Insert(onConflict = OnConflictStrategy.REPLACE) to update a row.
    @Insert
    fun insert(recording: Recording?)

    @Query("DELETE from Recording WHERE id = :id")
    fun deleteRecording(id: Int?)

    @Query("SELECT * from Recording WHERE uploaded AND device_name = :deviceName AND group_name = :groupname")
    fun getUploadedFromDevice(deviceName: String, groupname: String?): List<Recording>


    @Query("SELECT name from Recording WHERE device_name = :deviceName AND group_name = :groupname")
    fun getRecordingNamesForDevice(deviceName: String, groupname: String?): List<String>

    @Query("SELECT * from Recording WHERE not uploaded")
    fun getRecordingsToUpload(): List<Recording>

    @Query("SELECT * from Recording")
    fun getRecordingLiveData(): LiveData<List<Recording>>

    @Query("SELECT * from Recording")
    fun getAllRecordings(): List<Recording>

    @Query("UPDATE Recording SET uploaded = 1 WHERE id = :id")
    fun setAsUploaded(id: Int?)
}
