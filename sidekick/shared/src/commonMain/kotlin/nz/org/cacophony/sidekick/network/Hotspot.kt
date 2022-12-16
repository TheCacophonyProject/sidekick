package nz.org.cacophony.sidekick.network

import arrow.core.Either

sealed class HotspotError {
    object FailedToStart : HotspotError()
}

expect class Hotspot(ssid: String, passphrase: String) {
    fun start(): Either<HotspotError, Unit>
}