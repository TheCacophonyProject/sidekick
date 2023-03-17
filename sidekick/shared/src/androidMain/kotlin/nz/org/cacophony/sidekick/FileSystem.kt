package nz.org.cacophony.sidekick
import okio.FileSystem
import okio.Path
import okio.Path.Companion.toPath

actual fun writeToFile(file: Path, data: ByteArray): Path  {
    println("Writing to file $file")
    // check file's directory exists if parent is not null
    val parent = file.parent
    if (parent != null && !FileSystem.SYSTEM.exists(parent)) {
        FileSystem.SYSTEM.createDirectory(parent, true)
    }
    // if file exists, delete it
    if (FileSystem.SYSTEM.exists(file)) {
        FileSystem.SYSTEM.delete(file, false)
    }
    val res = FileSystem.SYSTEM.write(file, true) {
        write(data)
    }
    return file
}

actual fun createDirectory(path: String): Path {
    FileSystem.SYSTEM.createDirectory(path.toPath(), true)
    return path.toPath()
}

actual fun getFile(file: Path): ByteArray {
    // check recordings directory exists
    println("Getting file $file")
    val res = FileSystem.SYSTEM.read(file) {
        readByteArray()
    }
    return res
}
