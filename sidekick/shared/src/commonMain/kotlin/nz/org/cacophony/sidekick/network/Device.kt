package nz.org.cacophony.sidekick.network

import arrow.core.Option
import arrow.optics.optics

typealias Recording = String
typealias Recordings = List<Recording>

@optics
data class Device(
    val hostname: String,
    val port: String,
    val name: String,
    val recordings: Option<Recordings>
)