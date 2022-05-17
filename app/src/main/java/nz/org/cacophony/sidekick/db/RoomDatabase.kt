package nz.org.cacophony.sidekick.db

import android.content.Context
import android.util.Log
import androidx.room.Database
import androidx.room.Room
import nz.org.cacophony.sidekick.TAG
import nz.org.cacophony.sidekick.db.Migrations.Companion.MIGRATION_3_4
import nz.org.cacophony.sidekick.db.Migrations.Companion.MIGRATION_4_5
import java.io.File

@Database(entities = [Recording::class, Event::class], version = 5, exportSchema = false)
abstract class RoomDatabase : androidx.room.RoomDatabase() {

    abstract fun recordingDao(): RecordingDao
    abstract fun eventDao(): EventDao

    fun clearData() {
        val recordings = recordingDao().getAllRecordings()
        for (rec in recordings) {
            Log.i(TAG, rec.recordingPath)
            File(rec.recordingPath).delete()
            recordingDao().deleteRecording(rec.id)
        }
        val events = eventDao().getAllEvents()
        for (e in events) {
            eventDao().delete(e)
        }
    }

    companion object {

        @Volatile
        private var INSTANCE: RoomDatabase? = null

        fun getDatabase(context: Context): RoomDatabase? {
            if (INSTANCE == null) {
                synchronized(RoomDatabase::class.java) {
                    if (INSTANCE == null) {
                        INSTANCE = Room.databaseBuilder(context.applicationContext,
                                RoomDatabase::class.java, "recording_database")
                                .addMigrations(MIGRATION_3_4, MIGRATION_4_5)
                                .build()
                    }
                }
            }
            return INSTANCE
        }
    }
}
