package nz.org.cacophony.sidekick;

import android.arch.lifecycle.LiveData;
import android.arch.persistence.room.Dao;
import android.arch.persistence.room.Insert;
import android.arch.persistence.room.Query;

import java.util.List;


@Dao
public interface RecordingDao {

    // LiveData is a data holder class that can be observed within a given lifecycle.
    // Always holds/caches latest version of data. Notifies its active observers when the
    // data has changed. Since we are getting all the contents of the database,
    // we are notified whenever any of the database contents have changed.
    //@Query("SELECT * from Recording ORDER BY word ASC")
    //LiveData<List<Recording>> getAlphabetizedWords();

    @Query("SELECT * from Recording")
    List<Recording> getAll();

    // We do not need a conflict strategy, because the word is our primary key, and you cannot
    // add two items with the same primary key to the database. If the table has more than one
    // column, you can use @Insert(onConflict = OnConflictStrategy.REPLACE) to update a row.
    @Insert
    void insert(Recording recording);

    @Query("DELETE from Recording WHERE id = :id")
    void deleteRecording(Integer id);

    @Query("DELETE FROM Recording")
    void deleteAll();

    @Query("SELECT * from Recording WHERE uploaded AND device_name = :deviceName")
    List<Recording> getUploadedFromDevice(String deviceName);


    @Query("SELECT name from Recording WHERE device_name = :deviceName")
    List<String> getRecordingNamesFromDevice(String deviceName);

}