package nz.org.cacophony.sidekick.db

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

class Migrations {
    companion object {

        @JvmStatic
        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL(
                        "CREATE TABLE `event` (" +
                                "`id`           INTEGER NOT NULL, " +
                                "`device_id`    INTEGER NOT NULL, " +
                                "`event_id`    INTEGER NOT NULL, " +
                                "`timestamp`    TEXT NOT NULL, " +
                                "`type`         TEXT NOT NULL, " +
                                "`details`      TEXT NOT NULL, " +
                                "`uploaded`     INTEGER NOT NULL, " +    // Room doesn't allow booleans so integer is used instead
                                "PRIMARY KEY(`id`))"
                )
            }
        }
    }
}
