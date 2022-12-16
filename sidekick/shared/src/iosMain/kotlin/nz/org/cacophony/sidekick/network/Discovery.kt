package nz.org.cacophony.sidekick.network

import arrow.core.Either
import arrow.core.right
import platform.Network.*
import kotlinx.cinterop.*
import platform.darwin.dispatch_get_main_queue

actual class Discovery actual constructor(serviceType: String) {
    private val descriptor =
        nw_browse_descriptor_create_bonjour_service(serviceType, "local.")
//    private val serviceBrowser = nw_browser_create(descriptor, parameters)
    actual fun discoverDevices(onFoundDevice: (device: Device) -> Unit): Either<DiscoveryError, Unit> {
//        nw_browser_set_queue(serviceBrowser, dispatch_get_main_queue())
//        nw_browser_set_browse_results_changed_handler(serviceBrowser) { oldResults, newResult, batchComplete ->
//            println("Found new result: $newResult")
//            if (batchComplete) {
//                println("Batch complete")
//            }
//            println("Old results: $oldResults")
//        }
//        nw_browser_start(serviceBrowser)
        return Unit.right()
    }
}
