package nz.org.cacophony.sidekick

import android.content.Context
import android.content.SharedPreferences

const val STORAGE_LOCATION = "storage-location"
const val FORCE_COLLECTION = "force-collection"

class Preferences(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("SETTINGS", Context.MODE_PRIVATE)

    fun writeBoolean(key: String, value: Boolean) {
        prefs.edit().putBoolean(key, value).apply()
    }

    fun getBoolean(key: String): Boolean {
        return prefs.getBoolean(key, false)
    }

    fun getString(key: String): String? {
        return prefs.getString(key, null)
    }

    fun setString(key: String, value: String?) {
        prefs.edit().putString(key, value).apply()
    }
}