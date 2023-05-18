package nz.org.cacophony.sidekick

import arrow.core.Either
import okio.IOException
import okio.Path

expect fun createDirectory(path: String): Either<IOException, Path>
expect fun writeToFile(file: Path, data: ByteArray): Either<IOException, Path>
expect fun getFile(file: Path): Either<IOException, ByteArray>

expect fun hasFile(path: Path): Boolean

expect fun deleteDirectory(path: Path): Either<IOException, Unit>

expect fun deleteFile(path: Path): Either<IOException, Unit>