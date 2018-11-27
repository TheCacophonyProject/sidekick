package nz.org.cacophony.sidekick;


import android.arch.persistence.db.SupportSQLiteDatabase;
import android.arch.persistence.room.Database;
import android.arch.persistence.room.Room;
import android.arch.persistence.room.RoomDatabase;
import android.content.Context;
import android.os.AsyncTask;
import android.support.annotation.NonNull;

@Database(entities = {Recording.class}, version = 1, exportSchema = false)
public abstract class RecordingRoomDatabase extends RoomDatabase {

    public abstract RecordingDao recordingDao();

    // marking the instance as volatile to ensure atomic access to the variable
    private static volatile RecordingRoomDatabase INSTANCE;

    static RecordingRoomDatabase getDatabase(final Context context) {
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

    private static RoomDatabase.Callback sRoomDatabaseCallback = new RoomDatabase.Callback() {

        @Override
        public void onOpen(@NonNull SupportSQLiteDatabase db) {
            super.onOpen(db);
            new PopulateDbAsync(INSTANCE).execute();
        }
    };

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
