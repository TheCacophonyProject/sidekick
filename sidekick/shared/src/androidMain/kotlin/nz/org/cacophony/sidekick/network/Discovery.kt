package nz.org.cacophony.sidekick.network

import arrow.core.Either
import arrow.core.right

actual class Discovery actual constructor(serviceType: String) {
    actual fun discoverDevices(onFoundDevice: (Device) -> Unit): Either<DiscoveryError, Unit> {
        TODO("Not yet implemented")
        return Unit.right()
    }

}