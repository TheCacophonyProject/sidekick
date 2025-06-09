package nz.org.cacophony.sidekick

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.net.InetSocketAddress
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

class NsdHelper(private val context: Context) {
    companion object {
        private const val TAG = "NsdHelper"
        private const val SERVICE_TYPE = "_cacophonator-management._tcp."
        private const val MAX_RESOLVE_RETRIES = 5
        private const val MAX_DISCOVERY_RETRIES = 3
        private const val INITIAL_RESOLVE_RETRY_DELAY_MS = 500L
        private const val MAX_RESOLVE_RETRY_DELAY_MS = 5000L
        private const val RESOLVE_SOCKET_CHECK_TIMEOUT_MS = 2000
        private const val DISCOVERY_RESTART_DELAY_MS = 5000L
        private const val DEVICE_REACHABILITY_CHECK_INTERVAL_MS = 60000L // 1 minute
    }

    // Discovery state
    enum class DiscoveryState {
        INACTIVE,
        STARTING,
        ACTIVE,
        STOPPING,
        RESTARTING,
        FAILED
    }

    // Service states to track
    private data class ServiceState(
        val serviceInfo: NsdServiceInfo,
        var resolved: Boolean = false,
        var reachable: Boolean = false,
        var resolveAttempts: Int = 0,
        var lastSeen: Long = System.currentTimeMillis(),
        var isCurrentlyResolving: Boolean = false, // Track if service is currently being resolved
        var pendingRetryRunnable: Runnable? = null // Track pending retries
    )

    // Event callbacks
    var onServiceResolved: ((NsdServiceInfo) -> Unit)? = null
    var onServiceLost: ((NsdServiceInfo) -> Unit)? = null
    var onServiceResolveFailed: ((serviceName: String, errorCode: Int, message: String) -> Unit)? =
        null
    var onDiscoveryError: ((Throwable, Boolean) -> Unit)? = null
    var onDiscoveryStateChanged: ((DiscoveryState) -> Unit)? = null

    // State management
    private val _discoveryState = AtomicInteger(DiscoveryState.INACTIVE.ordinal)
    val discoveryState: DiscoveryState
        get() = DiscoveryState.values()[_discoveryState.get()]

    private val nsdManager by lazy {
        context.getSystemService(Context.NSD_SERVICE) as NsdManager
    }

    private var discoveryListener: NsdManager.DiscoveryListener? = null
    private val pendingQueue = ConcurrentLinkedQueue<NsdServiceInfo>()
    private val knownServices = ConcurrentHashMap<String, ServiceState>()
    private val discoveryRetryCount = AtomicInteger(0)

    private val mainHandler = Handler(Looper.getMainLooper())
    private val executor: ScheduledExecutorService = Executors.newScheduledThreadPool(2)
    private var reachabilityChecker: ScheduledFuture<*>? = null
    private var discoveryRestartTask: ScheduledFuture<*>? = null

    /**
     * Start service discovery with automatic retry and self-healing
     */
    fun startDiscovery() {
        // Only allow starting from INACTIVE or FAILED states
        if (!_discoveryState.compareAndSet(
                DiscoveryState.INACTIVE.ordinal,
                DiscoveryState.STARTING.ordinal
            ) &&
            !_discoveryState.compareAndSet(
                DiscoveryState.FAILED.ordinal,
                DiscoveryState.STARTING.ordinal
            )
        ) {
            Log.w(TAG, "Cannot start discovery in state: ${discoveryState}")
            return
        }

        updateState(DiscoveryState.STARTING)

        // Always stop previous listener properly to prevent state inconsistencies
        cleanupDiscovery(true)

        // Clear all pending retries to avoid stale operations
        cancelAllPendingRetries()
        
        // Reset service states but preserve known services
        knownServices.values.forEach { state ->
            state.isCurrentlyResolving = false
            state.pendingRetryRunnable = null
        }

        // Start reachability checker for ongoing health monitoring
        startReachabilityChecker()

        // Create new discovery listener
        discoveryListener = createDiscoveryListener()

        try {
            nsdManager.discoverServices(
                SERVICE_TYPE,
                NsdManager.PROTOCOL_DNS_SD,
                discoveryListener!!
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start discovery: ${e.message}")
            updateState(DiscoveryState.FAILED)
            onDiscoveryError?.invoke(e, true)
            scheduleDiscoveryRestart()
        }
    }

    /**
     * Stop discovery and clean up resources
     */
    fun stopDiscovery() {
        // Only attempt to stop if we're in ACTIVE, STARTING, or RESTARTING state
        val currentState = discoveryState
        if (currentState != DiscoveryState.ACTIVE &&
            currentState != DiscoveryState.STARTING &&
            currentState != DiscoveryState.RESTARTING
        ) {
            Log.d(TAG, "Discovery not active, nothing to stop")
            return
        }

        updateState(DiscoveryState.STOPPING)

        cleanupDiscovery(true)
        stopReachabilityChecker()
        cancelDiscoveryRestart()
        cancelAllPendingRetries() // Cancel all pending retries when stopping discovery

        // Reset state variables
        pendingQueue.clear()
        knownServices.clear()
        discoveryRetryCount.set(0)

        updateState(DiscoveryState.INACTIVE)
    }

    /**
     * Create the discovery listener with comprehensive error handling
     */
    private fun createDiscoveryListener(): NsdManager.DiscoveryListener {
        return object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(regType: String) {
                Log.d(TAG, "Discovery started: $regType")
                updateState(DiscoveryState.ACTIVE)
                // Reset retry count on successful start
                discoveryRetryCount.set(0)
            }

            override fun onServiceFound(service: NsdServiceInfo) {
                Log.d(TAG, "Service found: ${service.serviceName}")
                if (service.serviceType.contains(SERVICE_TYPE)) {
                    // Add to known services or update existing entry
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                        knownServices.computeIfAbsent(service.serviceName) {
                            ServiceState(service)
                        }
                    } else if (knownServices[service.serviceName] == null) {
                        knownServices[service.serviceName] = ServiceState(service)
                    }

                    // Queue for resolution only if not already resolving or resolved
                    knownServices[service.serviceName]?.let { state ->
                        if (!state.isCurrentlyResolving && !state.resolved) {
                            // Add to pending queue only if necessary, prevent duplicates
                            if (!pendingQueue.any { it.serviceName == service.serviceName }) {
                                pendingQueue.offer(service)
                                tryResolveNext() // Trigger resolve check
                            } else {
                                Log.d(TAG, "Service ${service.serviceName} already in pending queue.")
                            }
                        } else {
                            Log.d(TAG, "Service ${service.serviceName} is already resolving or resolved.")
                        }
                    }
                }
            }

            override fun onServiceLost(service: NsdServiceInfo) {
                Log.d(TAG, "Service lost: ${service.serviceName}")
                
                // Remove from queue
                removeFromQueue(service.serviceName)
                
                // Remove from known services and cancel any pending retry
                knownServices.remove(service.serviceName)?.let { state ->
                    // Cancel pending retry if service is lost while resolve was ongoing
                    state.pendingRetryRunnable?.let { runnable ->
                        Log.d(TAG, "Cancelling pending resolve retry for lost service: ${service.serviceName}")
                        mainHandler.removeCallbacks(runnable)
                    }
                    // Notify listener
                    onServiceLost?.invoke(service)
                }
            }

            override fun onDiscoveryStopped(serviceType: String) {
                Log.d(TAG, "Discovery stopped: $serviceType")

                if (discoveryState == DiscoveryState.RESTARTING) {
                    Log.d(TAG, "Discovery stopped as part of restart")
                    // Immediately restart discovery
                    mainHandler.post { startDiscovery() }
                } else {
                    updateState(DiscoveryState.INACTIVE)
                }
            }

            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                Log.e(TAG, "Start discovery failed: $errorCode for $serviceType")
                updateState(DiscoveryState.FAILED)

                val errorMsg = "Failed to start NSD discovery (code=$errorCode)"
                val error = Exception(errorMsg)
                onDiscoveryError?.invoke(error, discoveryRetryCount.get() >= MAX_DISCOVERY_RETRIES)

                scheduleDiscoveryRestart()
            }

            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
                Log.e(TAG, "Stop discovery failed: $errorCode for $serviceType")
                // We'll still consider discovery stopped to maintain consistency
                updateState(DiscoveryState.INACTIVE)

                val error = Exception("StopDiscoveryFailed code=$errorCode")
                onDiscoveryError?.invoke(error, false)
            }
        }
    }

    /**
     * Try to resolve the next service in the queue
     */
    private fun tryResolveNext() {
        val service = pendingQueue.poll() ?: return // Get next service or exit if queue is empty
        
        val serviceState = knownServices[service.serviceName]
        if (serviceState == null) {
            // Service was removed from knownServices between queuing and processing
            Log.w(TAG, "Service ${service.serviceName} not found in knownServices, skipping resolve.")
            // Try the next one immediately
            mainHandler.post { tryResolveNext() }
            return
        }
        
        // Check if already resolving (double check) or resolved
        if (serviceState.isCurrentlyResolving || serviceState.resolved) {
            Log.d(TAG, "Skipping resolve for ${service.serviceName}, already resolving/resolved.")
            // Try the next one in the queue immediately
            mainHandler.post { tryResolveNext() }
            return
        }
        
        // Mark as resolving *before* starting
        serviceState.isCurrentlyResolving = true
        resolveService(service, 0) // Start with attempt 0
    }

    /**
     * Resolve a service with exponential backoff for retries
     */
    private fun resolveService(service: NsdServiceInfo, attempt: Int) {
        val serviceName = service.serviceName
        val serviceState = knownServices[serviceName]
        
        // Check if service still exists and is marked as resolving
        if (serviceState == null || !serviceState.isCurrentlyResolving) {
            Log.w(TAG, "Resolve called for ${serviceName}, but state is invalid or not resolving. Aborting.")
            // Try the next service in queue
            mainHandler.post { tryResolveNext() }
            return
        }
        
        if (attempt >= MAX_RESOLVE_RETRIES) {
            Log.w(TAG, "Max resolve retries reached for $serviceName")
            onServiceResolveFailed?.invoke(
                serviceName,
                NsdManager.FAILURE_MAX_LIMIT,
                "Max retry attempts ($MAX_RESOLVE_RETRIES) exceeded"
            )
            // Reset state and allow next resolve
            serviceState.resolveAttempts = 0
            serviceState.isCurrentlyResolving = false
            serviceState.pendingRetryRunnable = null // Clear any pending runnable
            mainHandler.post { tryResolveNext() }
            return
        }

        // Save current attempt count
        serviceState.resolveAttempts = attempt + 1

        val resolveListener = object : NsdManager.ResolveListener {
            override fun onServiceResolved(resolvedService: NsdServiceInfo) {
                Log.d(TAG, "Service resolved: ${resolvedService.serviceName}")

                knownServices[resolvedService.serviceName]?.let { state ->
                    // Resolution succeeded
                    state.lastSeen = System.currentTimeMillis()
                    state.pendingRetryRunnable = null // Clear retry runnable
                    
                    // Don't mark as fully resolved yet - that happens after reachability check
                    // Verify service is actually reachable
                    checkIfStillReachable(resolvedService)
                } ?: run {
                    // Service was removed during resolution somehow
                    Log.w(TAG, "Resolved service ${resolvedService.serviceName} not found in knownServices")
                    // Allow next resolve
                    mainHandler.post { tryResolveNext() }
                }
            }

            override fun onResolveFailed(failedService: NsdServiceInfo, errorCode: Int) {
                Log.w(
                    TAG,
                    "Resolve failed: ${failedService.serviceName}, code=$errorCode (FAILURE_ALREADY_ACTIVE=3), attempt=${attempt + 1}"
                )

                knownServices[failedService.serviceName]?.let { state ->
                    // Ensure we are still tracking this service
                    if (!state.isCurrentlyResolving) {
                        Log.w(TAG, "Resolve failed for ${failedService.serviceName}, but no longer marked as resolving. Ignoring.")
                        mainHandler.post { tryResolveNext() }
                        return@let
                    }

                    // Special handling for FAILURE_ALREADY_ACTIVE, which indicates a stuck resolver in NsdManager
                    if (errorCode == NsdManager.FAILURE_ALREADY_ACTIVE) {
                        Log.w(TAG, "Resolve failed for ${failedService.serviceName} because a resolve was already active. This is often due to a bug in Android's NsdManager. Not retrying.")

                        // Notify listener with a more specific message
                        onServiceResolveFailed?.invoke(
                            failedService.serviceName,
                            errorCode,
                            "A resolve operation was already active. This can happen if the network changes frequently. The system will try again automatically."
                        )

                        // Reset state to allow a new attempt later, and unblock the queue
                        state.isCurrentlyResolving = false
                        state.pendingRetryRunnable?.let { mainHandler.removeCallbacks(it) } // Cancel any pending retry
                        state.pendingRetryRunnable = null
                        // IMPORTANT: Process the next service in the queue to prevent one stuck service from blocking all others.
                        mainHandler.post { tryResolveNext() }
                        return@let
                    }


                    val delayMs = calculateBackoffDelay(attempt)

                    // Notify listener about the specific error
                    onServiceResolveFailed?.invoke(
                        failedService.serviceName,
                        errorCode,
                        "Resolve failed (attempt ${attempt + 1}/$MAX_RESOLVE_RETRIES)"
                    )

                    // Schedule retry with proper tracking
                    val retryRunnable = Runnable {
                        // Check state again before retrying
                        knownServices[failedService.serviceName]?.let { currentState ->
                            if (currentState.isCurrentlyResolving) {
                                resolveService(failedService, attempt + 1)
                            } else {
                                Log.w(TAG, "Retry scheduled for ${failedService.serviceName}, but no longer resolving.")
                                mainHandler.post { tryResolveNext() }
                            }
                        } ?: run {
                            Log.w(TAG, "Retry scheduled for ${failedService.serviceName}, but service removed.")
                            mainHandler.post { tryResolveNext() }
                        }
                    }
                    state.pendingRetryRunnable = retryRunnable
                    mainHandler.postDelayed(retryRunnable, delayMs)
                } ?: run {
                    // Service disappeared between start and failure
                    Log.w(TAG, "Resolve failed for ${failedService.serviceName} but service not found in knownServices.")
                    mainHandler.post { tryResolveNext() }
                }
            }
        }

        Log.d(TAG, "Attempting to resolve ${service.serviceName} (attempt ${attempt + 1})")
        try {
            nsdManager.resolveService(service, resolveListener)
        } catch (e: Exception) {
            // Handle exceptions during resolveService call
            Log.e(TAG, "Exception calling nsdManager.resolveService for ${service.serviceName}: ${e.message}")
            
            knownServices[serviceName]?.let { state ->
                // Schedule retry if appropriate
                val delayMs = calculateBackoffDelay(attempt)
                val retryRunnable = Runnable {
                    knownServices[serviceName]?.let { currentState ->
                        if (currentState.isCurrentlyResolving) {
                            resolveService(service, attempt + 1)
                        } else {
                            Log.w(TAG, "Retry after exception scheduled for ${serviceName}, but no longer resolving.")
                            mainHandler.post { tryResolveNext() }
                        }
                    } ?: run {
                        Log.w(TAG, "Retry after exception scheduled for ${serviceName}, but service removed.")
                        mainHandler.post { tryResolveNext() }
                    }
                }
                state.pendingRetryRunnable = retryRunnable
                mainHandler.postDelayed(retryRunnable, delayMs)
            } ?: run {
                Log.w(TAG, "Exception calling resolveService for ${serviceName} but service not found.")
                mainHandler.post { tryResolveNext() }
            }
        }
    }

    /**
     * Calculate backoff delay with exponential increase
     */
    private fun calculateBackoffDelay(attempt: Int): Long {
        val exponentialDelay = INITIAL_RESOLVE_RETRY_DELAY_MS * (1 shl attempt)
        return minOf(exponentialDelay, MAX_RESOLVE_RETRY_DELAY_MS)
    }

    /**
     * Check if a resolved service is actually reachable
     */
    private fun checkIfStillReachable(service: NsdServiceInfo) {
        executor.submit {
            val reachable = try {
                Socket().use { socket ->
                    socket.connect(
                        InetSocketAddress(service.host, service.port),
                        RESOLVE_SOCKET_CHECK_TIMEOUT_MS
                    )
                }
                true
            } catch (e: Exception) {
                Log.w(TAG, "Socket connection failed for ${service.serviceName}: ${e.message}")
                false
            }

            mainHandler.post {
                knownServices[service.serviceName]?.let { state ->
                    state.reachable = reachable
                    state.lastSeen = System.currentTimeMillis()
                    
                    // Update resolved state based on reachability result
                    state.resolved = reachable

                    if (reachable) {
                        Log.d(TAG, "Service ${service.serviceName} is reachable")
                        onServiceResolved?.invoke(service)
                    } else {
                        Log.w(TAG, "Resolved service not reachable: ${service.serviceName}")
                        onServiceLost?.invoke(service)
                    }
                    
                    // IMPORTANT: Mark as no longer resolving after all checks complete
                    state.isCurrentlyResolving = false
                    
                } ?: run {
                    Log.w(TAG, "checkIfStillReachable: Service ${service.serviceName} not found in knownServices")
                }

                // Allow next resolve to proceed regardless of what happened
                tryResolveNext()
            }
        }
    }

    /**
     * Remove a service from the pending queue
     */
    private fun removeFromQueue(serviceName: String) {
        val it = pendingQueue.iterator()
        while (it.hasNext()) {
            val nextService = it.next()
            if (nextService.serviceName == serviceName) {
                it.remove()
                break
            }
        }
    }

    /**
     * Start periodic reachability checker to detect stale services
     */
    private fun startReachabilityChecker() {
        stopReachabilityChecker()

        reachabilityChecker = executor.scheduleWithFixedDelay(
            {
                checkReachabilityOfKnownServices()
            },
            DEVICE_REACHABILITY_CHECK_INTERVAL_MS,
            DEVICE_REACHABILITY_CHECK_INTERVAL_MS,
            TimeUnit.MILLISECONDS
        )
    }

    /**
     * Check reachability of all known services periodically
     */
    private fun checkReachabilityOfKnownServices() {
        val currentTime = System.currentTimeMillis()
        val staleThreshold = currentTime - (2 * DEVICE_REACHABILITY_CHECK_INTERVAL_MS)

        // Copy to avoid concurrent modification
        val services = HashMap(knownServices)

        for ((serviceName, state) in services) {
            // Skip services that haven't been resolved yet
            if (!state.resolved) continue

            // Check if service hasn't been seen recently
            if (state.lastSeen < staleThreshold) {
                executor.submit {
                    val stillReachable = try {
                        Socket().use { socket ->
                            socket.connect(
                                InetSocketAddress(state.serviceInfo.host, state.serviceInfo.port),
                                RESOLVE_SOCKET_CHECK_TIMEOUT_MS
                            )
                        }
                        true
                    } catch (e: Exception) {
                        false
                    }

                    mainHandler.post {
                        if (!stillReachable) {
                            // Service is no longer reachable
                            knownServices.remove(serviceName)?.let {
                                onServiceLost?.invoke(state.serviceInfo)
                            }
                        } else {
                            // Update last seen time
                            knownServices[serviceName]?.lastSeen = currentTime
                        }
                    }
                }
            }
        }
    }

    /**
     * Stop the reachability checker
     */
    private fun stopReachabilityChecker() {
        reachabilityChecker?.cancel(false)
        reachabilityChecker = null
    }

    /**
     * Schedule discovery restart with exponential backoff
     */
    private fun scheduleDiscoveryRestart() {
        cancelDiscoveryRestart()

        val currentRetries = discoveryRetryCount.incrementAndGet()
        if (currentRetries > MAX_DISCOVERY_RETRIES) {
            Log.e(TAG, "Exceeded maximum discovery restart attempts ($MAX_DISCOVERY_RETRIES)")
            return
        }

        // Calculate backoff delay - simple exponential backoff
        val delayMs = DISCOVERY_RESTART_DELAY_MS * (1 shl (currentRetries - 1))

        Log.d(TAG, "Scheduling discovery restart in ${delayMs}ms (attempt $currentRetries)")

        updateState(DiscoveryState.RESTARTING)

        discoveryRestartTask = executor.schedule({
            mainHandler.post {
                if (discoveryState == DiscoveryState.RESTARTING || discoveryState == DiscoveryState.FAILED) {
                    Log.d(TAG, "Executing scheduled discovery restart")
                    startDiscovery()
                }
            }
        }, delayMs, TimeUnit.MILLISECONDS)
    }

    /**
     * Cancel any pending discovery restart
     */
    private fun cancelDiscoveryRestart() {
        discoveryRestartTask?.cancel(false)
        discoveryRestartTask = null
    }

    /**
     * Cancel all pending retry operations
     */
    private fun cancelAllPendingRetries() {
        Log.d(TAG, "Cancelling all pending resolve retries")
        knownServices.values.forEach { state ->
            state.pendingRetryRunnable?.let { runnable ->
                mainHandler.removeCallbacks(runnable)
            }
            state.pendingRetryRunnable = null
        }
    }

    /**
     * Restart discovery properly
     */
    fun restartDiscovery() {
        Log.d(TAG, "Restarting discovery")
        updateState(DiscoveryState.RESTARTING)
        
        // First clean up all resources
        cleanupDiscovery(true)
        cancelAllPendingRetries()
        
        // Reset state but don't clear all known services
        knownServices.values.forEach { state ->
            state.isCurrentlyResolving = false
        }
        
        // Start discovery after a short delay to ensure everything is cleaned up
        mainHandler.postDelayed({
            startDiscovery()
        }, 300)
    }

    /**
     * Clean up discovery listener and related resources
     */
    private fun cleanupDiscovery(notifyManager: Boolean) {
        val listener = discoveryListener
        if (listener != null && notifyManager) {
            try {
                nsdManager.stopServiceDiscovery(listener)
            } catch (e: Exception) {
                Log.e(TAG, "Error stopping service discovery: ${e.message}")
            }
        }
        discoveryListener = null
    }

    /**
     * Update discovery state and notify listeners
     */
    private fun updateState(newState: DiscoveryState) {
        val oldState = DiscoveryState.values()[_discoveryState.getAndSet(newState.ordinal)]
        if (oldState != newState) {
            Log.d(TAG, "Discovery state changed: $oldState -> $newState")
            mainHandler.post {
                onDiscoveryStateChanged?.invoke(newState)
            }
        }
    }

    /**
     * Clean up all resources
     * Should be called in onDestroy to prevent leaks
     */
    fun cleanup() {
        stopDiscovery()
        executor.shutdownNow()
    }
}