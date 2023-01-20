package nz.org.cacophony.sidekick.device

import arrow.optics.optics

typealias Recording = String
typealias Recordings = List<Recording>
typealias Hostname = String
typealias Port = Long
typealias URL = String

@optics data class Host(val name: Hostname, val port: Port)

@optics
data class Device(
     val url: URL,
)
