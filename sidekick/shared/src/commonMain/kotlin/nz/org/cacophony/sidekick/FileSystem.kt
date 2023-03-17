package nz.org.cacophony.sidekick

import okio.Path

expect fun createDirectory(path: String): Path
expect fun writeToFile(file: Path, data: ByteArray): Path
expect fun getFile(file: Path): ByteArray