package nz.org.cacophony.sidekick;


import android.content.Context;
import android.os.AsyncTask;

import androidx.annotation.NonNull;
import androidx.room.Database;
import androidx.room.Room;
import androidx.room.RoomDatabase;
import androidx.sqlite.db.SupportSQLiteDatabase;

@Database(entities = {Recording.class}, version = 3, exportSchema = false)
public abstract class RecordingRoomDatabase extends RoomDatabase {

    // marking the instance as volatile to ensure atomic access to the variable
    private static volatile RecordingRoomDatabase INSTANCE;
    private static RoomDatabase.Callback sRoomDatabaseCallback = new RoomDatabase.Callback() {

        @Override
        public void onOpen(@NonNull SupportSQLiteDatabase db) {
            super.onOpen(db);
            new PopulateDbAsync(INSTANCE).execute();
        }
    };

    public static RecordingRoomDatabase getDatabase(final Context context) {
        if (INSTANCE == null) {
            synchronized (RecordingRoomDatabase.class) {
                if (INSTANCE == null) {
                    INSTANCE = Room.databaseBuilder(context.getApplicationContext(),
                            RecordingRoomDatabase.class, "recording_database")
                            // Wipes and rebuilds instead of migrating if no Migration object.
                            // Migration is not part of this codelab.
                            .fallbackToDestructiveMigration()
                            .addCallback(sRoomDatabaseCallback)
                            .build();
                }
            }
        }
        return INSTANCE;
    }

    public abstract RecordingDao recordingDao();

    private static class PopulateDbAsync extends AsyncTask<Void, Void, Void> {

        private final RecordingDao mDao;

        PopulateDbAsync(RecordingRoomDatabase db) {
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
