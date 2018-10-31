package nz.org.cacophony.sidekick;

import android.arch.persistence.room.ColumnInfo;
import android.arch.persistence.room.Entity;
import android.arch.persistence.room.Index;
import android.arch.persistence.room.PrimaryKey;
import android.support.annotation.NonNull;

@Entity(tableName = "recording", indices = {@Index(value = "recording_path", unique = true)})
public class Recording {

    /*
    This table stores all the recordings downloaded from a device.
    When a recording is download from a device it should be added to the table then deleted after it
    is uploaded to the server.
     */

    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "id")
    Integer id;

    @NonNull
    @ColumnInfo(name  = "device_name")
    String deviceName;

    @NonNull
    @ColumnInfo(name = "recording_path")
    String recordingPath;

    @NonNull
    @ColumnInfo(name = "uploaded") // Set to true when the recording had been uploaded to the server
    Boolean uploaded = false;

    @ColumnInfo(name = "size")
    Integer size;

    @NonNull
    @ColumnInfo(name = "name")
    String name;

    public Recording(@NonNull String deviceName, @NonNull String recordingPath, @NonNull String name) {
        this.deviceName = deviceName;
        this.recordingPath = recordingPath;
        this.name = name;
    }

    @NonNull
    public Recording getRecording() {
        return this;
    }

    @Override
    public String toString() {
        return "{ id: " + id + ", deviceName: " + deviceName + ", recordingPath: " + recordingPath + " }";
    }
}