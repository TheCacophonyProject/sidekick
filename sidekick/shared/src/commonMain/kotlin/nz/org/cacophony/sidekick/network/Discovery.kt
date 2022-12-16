package nz.org.cacophony.sidekick.network

import arrow.core.Either

sealed class DiscoveryError {
    object NoDevicesFound : DiscoveryError()
    data class Unknown(val message: String) : DiscoveryError()
}

expect class Discovery(serviceType: String) {
    fun discoverDevices(onFoundDevice: (device: Device) -> Unit): Either<DiscoveryError, Unit>
}