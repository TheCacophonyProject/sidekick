package nz.org.cacophony.sidekick.db;


import android.content.Context;
import android.os.AsyncTask;

import androidx.annotation.NonNull;
import androidx.room.Database;
import androidx.room.Room;
import androidx.sqlite.db.SupportSQLiteDatabase;

@Database(entities = {Recording.class, Event.class}, version = 4, exportSchema = false)
public abstract class RoomDatabase extends androidx.room.RoomDatabase {

    // marking the instance as volatile to ensure atomic access to the variable
    private static volatile RoomDatabase INSTANCE;
    private static androidx.room.RoomDatabase.Callback sRoomDatabaseCallback = new androidx.room.RoomDatabase.Callback() {

        @Override
        public void onOpen(@NonNull SupportSQLiteDatabase db) {
            super.onOpen(db);
            new PopulateDbAsync(INSTANCE).execute();
        }
    };

    public static RoomDatabase getDatabase(final Context context) {

        if (INSTANCE == null) {
            synchronized (RoomDatabase.class) {
                if (INSTANCE == null) {
                    INSTANCE = Room.databaseBuilder(context.getApplicationContext(),
                            RoomDatabase.class, "recording_database")
                            .addMigrations(Migrations.getMIGRATION_3_4())
                            .addCallback(sRoomDatabaseCallback)
                            .build();
                }
            }
        }
        return INSTANCE;
    }

    public abstract RecordingDao recordingDao();

    public abstract EventDao eventDao();

    private static class PopulateDbAsync extends AsyncTask<Void, Void, Void> {

        private final RecordingDao mDao;

        PopulateDbAsync(RoomDatabase db) {
            mDao = db.recordingDao();
        }

        @Override
        protected Void doInBackground(final Void... params) {
            // Start the app with a clean database every time.
            // Not needed if you only populate on creation.
            //mDao.deleteAll();
            return null;
        }
    }
}