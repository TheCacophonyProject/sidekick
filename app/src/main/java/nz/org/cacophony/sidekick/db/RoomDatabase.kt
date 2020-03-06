package nz.org.cacophony.sidekick.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import nz.org.cacophony.sidekick.db.Migrations.Companion.MIGRATION_3_4

@Database(entities = [Recording::class, Event::class], version = 4, exportSchema = false)
abstract class RoomDatabase : androidx.room.RoomDatabase() {

    abstract fun recordingDao(): RecordingDao
    abstract fun eventDao(): EventDao

    companion object {

        @Volatile
        private var INSTANCE: RoomDatabase? = null

        fun getDatabase(context: Context): RoomDatabase? {
            if (INSTANCE == null) {
                synchronized(RoomDatabase::class.java) {
                    if (INSTANCE == null) {
                        INSTANCE = Room.databaseBuilder(context.applicationContext,
                                RoomDatabase::class.java, "recording_database")
                                .addMigrations(MIGRATION_3_4)
                                .build()
                    }
                }
            }
            return INSTANCE
        }
    }
}
