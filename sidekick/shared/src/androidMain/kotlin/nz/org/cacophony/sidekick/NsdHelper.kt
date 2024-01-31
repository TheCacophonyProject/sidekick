package nz.org.cacophony.sidekick
import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import java.util.*
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.collections.ArrayList

abstract class NsdHelper(val context: Context) {

    // Declare DNS-SD related variables for service discovery
    val nsdManager: NsdManager? = context.getSystemService(Context.NSD_SERVICE) as NsdManager?
    private var discoveryListener: NsdManager.DiscoveryListener? = null
    private var resolveListener: NsdManager.ResolveListener? = null
    private var resolveListenerBusy = AtomicBoolean(false)
    private var pendingNsdServices = ConcurrentLinkedQueue<NsdServiceInfo>()
    var resolvedNsdServices: MutableList<NsdServiceInfo> = Collections.synchronizedList(ArrayList<NsdServiceInfo>())

    companion object {

        // Type of services to look for
        const val NSD_SERVICE_TYPE: String = "_cacophonator-management._tcp."
    }

    // Initialize Listeners
    fun initializeNsd() {
        // Initialize only resolve listener
        initializeResolveListener()
    }

    // Instantiate DNS-SD discovery listener
    // used to discover available Sonata audio servers on the same network
    private fun initializeDiscoveryListener() {

        // Instantiate a new DiscoveryListener
        discoveryListener = object : NsdManager.DiscoveryListener {

            override fun onDiscoveryStarted(regType: String) {
                // Called as soon as service discovery begins.
                println("Service discovery started: $regType")
            }

            override fun onServiceFound(service: NsdServiceInfo) {
                // A service was found! Do something with it
                println("Service discovery success: $service")

                if ( service.serviceType == NSD_SERVICE_TYPE ){
                    // Both service type and service name are the ones we want
                    // If the resolver is free, resolve the service to get all the details
                    if (resolveListenerBusy.compareAndSet(false, true)) {
                        nsdManager?.resolveService(service, resolveListener)
                    }
                    else {
                        // Resolver was busy. Add the service to the list of pending services
                        pendingNsdServices.add(service)
                    }
                }
                else {
                    // Not our service. Log message but do nothing else
                    println("Not our Service - Name: ${service.serviceName}, Type: ${service.serviceType}")
                }
            }

            override fun onServiceLost(service: NsdServiceInfo) {
                println("Service lost: $service")

                // If the lost service was in the queue of pending services, remove it
                var iterator = pendingNsdServices.iterator()
                while (iterator.hasNext()) {
                    if (iterator.next().serviceName == service.serviceName)
                        iterator.remove()
                }

                // If the lost service was in the list of resolved services, remove it
                synchronized(resolvedNsdServices) {
                    iterator = resolvedNsdServices.iterator()
                    while (iterator.hasNext()) {
                        if (iterator.next().serviceName == service.serviceName)
                            iterator.remove()
                    }
                }

                // Do the rest of the processing for the lost service
                onNsdServiceLost(service)
            }

            override fun onDiscoveryStopped(serviceType: String) {
                println("Discovery stopped: $serviceType")
            }

            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                println("Start Discovery failed: Error code: $errorCode")
                stopDiscovery()
            }

            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
                println("Stop Discovery failed: Error code: $errorCode")
                nsdManager?.stopServiceDiscovery(this)
            }
        }
    }

    // Instantiate DNS-SD resolve listener to get extra information about the service
    private fun initializeResolveListener() {
        resolveListener =  object : NsdManager.ResolveListener {

            override fun onServiceResolved(service: NsdServiceInfo) {
                println("Resolve Succeeded: $service")

                // Register the newly resolved service into our list of resolved services
                resolvedNsdServices.add(service)

                // Process the newly resolved service
                onNsdServiceResolved(service)

                // Process the next service waiting to be resolved
                resolveNextInQueue()
            }

            override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                // Called when the resolve fails. Use the error code to debug.
                println("Resolve failed: $serviceInfo - Error code: $errorCode")

                // Process the next service waiting to be resolved
                resolveNextInQueue()
            }
        }
    }

    // Start discovering services on the network
    fun discoverServices() {
        // Cancel any existing discovery request
        stopDiscovery()

        initializeDiscoveryListener()

        // Start looking for available audio channels in the network
        nsdManager?.discoverServices(NSD_SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discoveryListener)
    }

    // Stop DNS-SD service discovery
    fun stopDiscovery() {
        if (discoveryListener != null) {
            try {
                // check if discovery is already in progress
                nsdManager?.stopServiceDiscovery(discoveryListener)
            } finally {
            }
            discoveryListener = null
        }
    }

    // Resolve next NSD service pending resolution
    private fun resolveNextInQueue() {
        // Get the next NSD service waiting to be resolved from the queue
        val nextNsdService = pendingNsdServices.poll()
        if (nextNsdService != null) {
            // There was one. Send to be resolved.
            nsdManager?.resolveService(nextNsdService, resolveListener)
        }
        else {
            // There was no pending service. Release the flag
            resolveListenerBusy.set(false)
        }
    }

    // Function to be overriden with custom logic for new service resolved
    abstract fun onNsdServiceResolved(service: NsdServiceInfo)

    // Function to be overriden with custom logic for service lost
    abstract fun onNsdServiceLost(service: NsdServiceInfo)
}