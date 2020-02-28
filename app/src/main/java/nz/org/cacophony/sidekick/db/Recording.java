package nz.org.cacophony.sidekick.db;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.room.ColumnInfo;
import androidx.room.Entity;
import androidx.room.Index;
import androidx.room.PrimaryKey;

@Entity(tableName = "recording", indices = {@Index(value = "recording_path", unique = true)})
public class Recording {

    /*
    This table stores all the recordings downloaded from a device.
    When a recording is download from a device it should be added to the table then deleted after it
    is uploaded to the server.
     */

    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "id")
    public Integer id;

    @NonNull
    @ColumnInfo(name = "device_name")
    public String deviceName;

    @Nullable
    @ColumnInfo(name = "group_name")
    public String groupName;

    @NonNull
    @ColumnInfo(name = "device_id")
    public int deviceID;

    @NonNull
    @ColumnInfo(name = "recording_path")
    public String recordingPath;

    @NonNull
    @ColumnInfo(name = "uploaded") // Set to true when the recording had been uploaded to the server
            Boolean uploaded = false;

    @ColumnInfo(name = "size")
    public Integer size;

    @NonNull
    @ColumnInfo(name = "name")
    public String name;

    public Recording(@NonNull String deviceName, @NonNull String recordingPath, @NonNull String name, @Nullable String groupName, @NonNull int deviceID) {
        this.deviceName = deviceName;
        this.recordingPath = recordingPath;
        this.name = name;
        this.groupName = groupName;
        this.deviceID = deviceID;
    }

    @NonNull
    public Recording getRecording() {
        return this;
    }

    @Override
    public String toString() {
        return "{ id: " + id + ", deviceName: " + deviceName + ", groupName: " + groupName + ", deviceID: " + deviceID + ", recordingPath: " + recordingPath + ", uploaded: " + uploaded + " }";
    }
}