package nz.org.cacophony.sidekick

import android.content.Context
import android.os.StatFs

const val MEGABYTE = 1048576
const val STORAGE_REQUIREMENT_MB = 100

class Util {
    companion object {

        /**
         * Size of file system in MB for the given path
         */
        fun fsSizeMB(path: String): Float {
            val stat = StatFs(path)
            return stat.blockSizeLong * stat.blockCountLong / MEGABYTE.toFloat()
        }

        /**
         * MB available in the file system given path
         */
        fun fsAvailableMB(path: String): Float {
            val stat = StatFs(path)
            return stat.blockSizeLong * stat.availableBlocksLong / MEGABYTE.toFloat()
        }

        /**
         * Check that that storage location used has meet the minimum storage requirement.
         * Will throw a LowStorageSpaceException if not.
         */
        fun checkAvailableStorage(c: Context) {
            val path = Preferences(c).getString(STORAGE_LOCATION) ?: throw Exception("storage location not set")
            val availableMB = fsAvailableMB(path)
            if (availableMB < STORAGE_REQUIREMENT_MB) {
                throw LowStorageSpaceException(availableMB)
            }
        }
    }
}

class LowStorageSpaceException(mbAvailable: Float): Exception("Low storage space on phone. Only ${mbAvailable}MB storage space left")