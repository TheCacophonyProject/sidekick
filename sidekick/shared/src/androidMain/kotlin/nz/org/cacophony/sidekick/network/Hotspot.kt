package nz.org.cacophony.sidekick.network

import arrow.core.Either

actual class Hotspot actual constructor(ssid: String, passphrase: String) {
    actual fun start(): Either<HotspotError, Unit> {
        TODO("Not yet implemented")
    }
}