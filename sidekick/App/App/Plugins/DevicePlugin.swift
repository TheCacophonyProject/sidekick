//
//  DevicePlugin.swift
//  App
//
//  Created by Patrick Baxter on 13/12/22.
//

import Network
import Capacitor
import shared
import NetworkExtension
import SystemConfiguration.CaptiveNetwork

let type = "_cacophonator-management._tcp"
let domain = "local."

@objc(DevicePlugin)
public class DevicePlugin: CAPPlugin, CAPBridgedPlugin {
    public var identifier: String = "DevicePlugin"
    public var jsName: String = "Device"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "discoverDevices",returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopDiscoverDevices",returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkDeviceConnection",returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDeviceInfo",returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setDeviceConfig",returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDeviceConfig",returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setLowPowerMode",returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connectToDeviceAP", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkIsAPConnected", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDeviceLocation",returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setDeviceLocation",returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getRecordings",returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getEvents",returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteEvents",returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getEventKeys",returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteRecording",returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteRecordings",returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloadRecording",returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateRecordingWindow",returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unbindConnection",returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "rebindConnection",returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hasConnection",returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnectFromDeviceAP",returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "turnOnModem",returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reregisterDevice",returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions",returnType: CAPPluginReturnPromise),
    ]
    
    enum CallType {
        case permissions
        case singleUpdate
        case discover
    }
    enum Result {
        case success
        case failed
    }
    
    @objc let device = DeviceInterface(filePath: documentPath)
    let configuration = NEHotspotConfiguration(ssid: "bushnet", passphrase: "feathers", isWEP: false)
    var isConnected = false
    
    private var callQueue: [String: CallType] = [:]
    func createBrowser() -> NWBrowser {
        return NWBrowser(for: .bonjour(type: type, domain: domain), using: .tcp)
    }
    private var serviceBrowser: NWBrowser?
    private var isDiscovering = false
    func getIPFromHost(_ host: Network.NWEndpoint.Host) -> String? {
        switch host {
        case .ipv4(let ipv4Address):
            return ipv4Address.debugDescription
        case .ipv6(let ipv6Address):
            var ipString = ipv6Address.debugDescription
            // Remove the scope ID if present
            if let percentIndex = ipString.firstIndex(of: "%") {
                ipString = String(ipString[..<percentIndex])
            }
            return ipString
        case .name(let hostname, _):
            return hostname
        @unknown default:
            return nil
        }
    }
    
    // Discovery state enum to match Android implementation
    enum DiscoveryState: String {
        case inactive = "INACTIVE"
        case starting = "STARTING"
        case active = "ACTIVE"
        case stopping = "STOPPING"
        case restarting = "RESTARTING"
        case failed = "FAILED"
    }
    
    // Connection state enum to match Android implementation
    enum ConnectionState: String {
        case disconnected = "DISCONNECTED"
        case connecting = "CONNECTING"
        case connectionVerifying = "CONNECTION_VERIFYING"
        case connected = "CONNECTED"
        case disconnecting = "DISCONNECTING"
        case connectionFailed = "CONNECTION_FAILED"
        case connectionLost = "CONNECTION_LOST"
    }
    
    private var discoveryState: DiscoveryState = .inactive
    private var connectionState: ConnectionState = .disconnected
    private var discoveryRetryCount = 0
    private var discoveryRetryTimer: Timer?
    private var connectionMonitorTimer: Timer?
    private var connectionTimeoutTimer: Timer?
    private var verificationTimer: Timer?
    private var lastKnownConnectionState = false
    private var isMonitoringActive = false
    private var isMonitoringInitialized = false
    
    private var knownDefunctConnections = Set<String>()
    private let CONNECTION_CHECK_INTERVAL: TimeInterval = 2.0
    private let DISCONNECT_DETECTION_TIMEOUT: TimeInterval = 5.0
    
    public override func load() {
        super.load()
        
        startWiFiMonitoring()
    }
    
    deinit {
        stopWiFiMonitoring()
    }
    
    // Add continuous monitoring for WiFi connection
    private func startWiFiMonitoring() {
        guard !isMonitoringActive else {
            return
        }
        
        isMonitoringActive = true
        
        // Do initial connection check
        checkCurrentConnection { [weak self] isConnected in
            guard let self = self else { return }
            
            // On initial check, don't move to disconnected state 
            // to avoid disabling the connection button
            if (isConnected) {
                self.updateConnectionState(.connected)
            } else if (!self.isMonitoringInitialized) {
                // For first check, keep state as default if disconnected
                // This preserves the button's enabled state
                self.connectionState = .disconnected
                self.notifyListeners("onAPConnectionStateChanged", data: ["state": "default"])
            } else {
                self.updateConnectionState(.disconnected)
            }
            
            self.lastKnownConnectionState = isConnected
            self.isMonitoringInitialized = true
        }
        
        // Set up periodic monitoring with shorter interval for faster disconnect detection
        connectionMonitorTimer = Timer.scheduledTimer(withTimeInterval: CONNECTION_CHECK_INTERVAL, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            
            self.checkCurrentConnection { isConnected in
                // Only update if state has changed and we're already initialized
                if isConnected != self.lastKnownConnectionState {
                    self.updateConnectionState(isConnected ? .connected : .disconnected)
                    self.lastKnownConnectionState = isConnected
                }
            }
        }
    }
    
    private func stopWiFiMonitoring() {
        connectionMonitorTimer?.invalidate()
        connectionMonitorTimer = nil
        isMonitoringActive = false
    }
    
    private func updateDiscoveryState(_ newState: DiscoveryState) {
        if discoveryState != newState {
            discoveryState = newState
            notifyListeners("onDiscoveryStateChanged", data: ["state": newState.rawValue])
        }
    }
    
    private func updateConnectionState(_ newState: ConnectionState) {
        if connectionState != newState {
            connectionState = newState
            notifyListeners("onAPConnectionStateChanged", data: ["state": newState.rawValue])
            
            // Additional notifications based on state transitions
            switch newState {
            case .connected:
                notifyListeners("onAPConnected", data: ["status": "connected"])
            case .disconnected:
                notifyListeners("onAPDisconnected", data: ["status": "disconnected"])
            case .connectionFailed:
                notifyListeners("onAPConnectionFailed", data: [
                    "status": "error",
                    "error": "Connection failed",
                    "canRetry": true
                ])
            case .connectionLost:
                notifyListeners("onAPConnectionLost", data: [
                    "status": "lost",
                    "message": "Connection to device network lost"
                ])
            default:
                break
            }
        }
    }
    
    @objc func discoverDevices(_ call: CAPPluginCall) {
        // Only allow starting from INACTIVE or FAILED states
        guard discoveryState == .inactive || discoveryState == .failed else {
            call.reject("Cannot start discovery in state: \(discoveryState.rawValue)")
            return
        }
        
        print("Starting device discovery for service type: \(type)")
        
        // Update state and notify listeners
        updateDiscoveryState(.starting)
        
        // Clean up any existing discovery
        cleanupDiscovery()
        
        // Clear known defunct connections
        knownDefunctConnections.removeAll()
        
        // Create parameters with improved error handling
        let parameters = NWParameters()
        parameters.requiredInterfaceType = .wifi
        // Add a specific expiration timeout
        parameters.expiredDNSBehavior = .systemDefault
        
        serviceBrowser = NWBrowser(for: .bonjour(type: type, domain: domain), using: parameters)
        serviceBrowser?.stateUpdateHandler = { [weak self] newState in
            guard let self = self else { return }
            
            switch newState {
            case .ready:
                self.updateDiscoveryState(.active)
                // Reset retry count on successful start
                self.discoveryRetryCount = 0
                
            case .failed(let error):
                // Improved handling for defunct connection errors
                let errorDescription = error.localizedDescription
                
                if case let NWError.dns(dnsError) = error {
                    print("DNS Error during discovery: \(dnsError)")
                }
                
                // Check if this is the -65569 (DefunctConnection) error
                if errorDescription.contains("DefunctConnection") || errorDescription.contains("-65569") {
                    print("Defunct connection error detected, will restart browser")
                    
                    // Don't report this as an error to the UI if we're going to retry
                    if self.discoveryRetryCount < 3 {
                        // Schedule immediate retry for this specific error
                        self.scheduleDiscoveryRetry(immediate: true)
                        return
                    }
                }
                
                self.updateDiscoveryState(.failed)
                
                // Only notify listeners of fatal errors to reduce UI noise
                let isFatal = self.discoveryRetryCount >= 3
                self.notifyListeners("onDiscoveryError", data: [
                    "error": errorDescription,
                    "fatal": isFatal
                ])
                
                if !isFatal {
                    // Schedule retry if not fatal
                    self.scheduleDiscoveryRetry()
                }
                
            case .cancelled:
                if self.discoveryState == .restarting {
                    // Immediately restart discovery
                    DispatchQueue.main.async {
                        self.startDiscovery()
                    }
                } else {
                    self.updateDiscoveryState(.inactive)
                }
                
            default:
                break
            }
        }
        
        serviceBrowser?.browseResultsChangedHandler = { [weak self] results, changes in
            guard let self = self else { return }
            
            print("Browse results changed: \(results.count) results, \(changes.count) changes")
            
            for change in changes {
                switch change {
                case .added(let result):
                    // Extract service details
                    let (name, port) = extractServiceDetails(from: result.endpoint)
                    let endpoint = "\(name).local"
                    
                    // Skip verification for known defunct connections
                    if self.knownDefunctConnections.contains(endpoint) {
                        continue
                    }
                    
                    // Verify the service is reachable
                    self.verifyServiceReachability(endpoint: endpoint) { isReachable in
                        if isReachable {
                            self.notifyListeners("onServiceResolved", data: [
                                "endpoint": endpoint,
                                "host": endpoint,
                                "port": port
                            ])
                        } else {
                            // Track defunct connections to avoid repeated verification attempts
                            self.knownDefunctConnections.insert(endpoint)
                        }
                    }
                    
                case .removed(let result):
                    let endpoint = switch result.endpoint {
                    case .service(let name, _, _, _):
                        "\(name).local"
                    default:
                        result.endpoint.debugDescription
                    }
                    
                    // Remove from defunct connections if it was in there
                    self.knownDefunctConnections.remove(endpoint)
                    
                    self.notifyListeners("onServiceLost", data: ["endpoint": endpoint])
                    
                case .changed(old: _, new: let new, flags: _):
                    // Extract service details
                    let (name, port) = extractServiceDetails(from: new.endpoint)
                    let endpoint = "\(name).local"
                    
                    // Skip verification for known defunct connections
                    if self.knownDefunctConnections.contains(endpoint) {
                        continue
                    }
                    
                    // Verify the service is reachable
                    self.verifyServiceReachability(endpoint: endpoint) { isReachable in
                        if isReachable {
                            self.notifyListeners("onServiceResolved", data: [
                                "endpoint": endpoint,
                                "host": endpoint,
                                "port": port
                            ])
                        } else {
                            // Track defunct connections
                            self.knownDefunctConnections.insert(endpoint)
                        }
                    }
                case .identical:
                    break
                @unknown default:
                    break
                }
            }
        }
        
        serviceBrowser?.start(queue: .main)
        isDiscovering = true
        call.resolve()
    }
    
    private func startDiscovery() {
        // Create parameters with timeout settings
        let parameters = NWParameters()
        parameters.requiredInterfaceType = .wifi
        parameters.expiredDNSBehavior = .systemDefault
        
        serviceBrowser = NWBrowser(for: .bonjour(type: type, domain: domain), using: parameters)
        serviceBrowser?.stateUpdateHandler = { [weak self] newState in
            guard let self = self else { return }
            
            switch newState {
            case .ready:
                self.updateDiscoveryState(.active)
                self.discoveryRetryCount = 0
                
            case .failed(let error):
                let errorDescription = error.localizedDescription
                
                // Special handling for defunct connection errors
                if errorDescription.contains("DefunctConnection") || errorDescription.contains("-65569") {
                    print("Defunct connection error detected in restart, retrying")
                    
                    if self.discoveryRetryCount < 3 {
                        // Schedule immediate retry for this specific error
                        self.scheduleDiscoveryRetry(immediate: true)
                        return
                    }
                }
                
                self.updateDiscoveryState(.failed)
                self.notifyListeners("onDiscoveryError", data: [
                    "error": errorDescription,
                    "fatal": self.discoveryRetryCount >= 3
                ])
                
                if self.discoveryRetryCount < 3 {
                    self.scheduleDiscoveryRetry()
                }
                
            case .cancelled:
                if self.discoveryState == .restarting {
                    DispatchQueue.main.async {
                        self.startDiscovery()
                    }
                } else {
                    self.updateDiscoveryState(.inactive)
                }
                
            default:
                break
            }
        }
        
        serviceBrowser?.browseResultsChangedHandler = { [weak self] results, changes in
            guard let self = self else { return }
            
            for change in changes {
                switch change {
                case .added(let result):
                    // Extract service details
                    let (name, port) = extractServiceDetails(from: result.endpoint)
                    let endpoint = "\(name).local"
                    
                    // Skip verification for endpoints we already know are defunct
                    if self.knownDefunctConnections.contains(endpoint) {
                        continue
                    }
                    
                    self.verifyServiceReachability(endpoint: endpoint) { isReachable in
                        if isReachable {
                            self.notifyListeners("onServiceResolved", data: [
                                "endpoint": endpoint,
                                "host": endpoint,
                                "port": port
                            ])
                        } else {
                            self.knownDefunctConnections.insert(endpoint)
                        }
                    }
                    
                case .removed(let result):
                    let endpoint = switch result.endpoint {
                    case .service(let name, _, _, _):
                        "\(name).local"
                    default:
                        result.endpoint.debugDescription
                    }
                    
                    // Clean up tracking
                    self.knownDefunctConnections.remove(endpoint)
                    
                    self.notifyListeners("onServiceLost", data: ["endpoint": endpoint])
                    
                case .changed, .identical:
                    break
                    
                @unknown default:
                    break
                }
            }
        }
        
        serviceBrowser?.start(queue: .main)
    }
    
    private func verifyServiceReachability(endpoint: String, completion: @escaping (Bool) -> Void) {
        // Use NWConnection for more reliable reachability check
        let host = NWEndpoint.Host(endpoint)
        let port = NWEndpoint.Port(integerLiteral: 80)
        
        // Create parameters optimized for fast verification
        let parameters = NWParameters.tcp
        parameters.prohibitedInterfaceTypes = [.cellular]
        
        let connection = NWConnection(host: host, port: port, using: parameters)
        
        connection.stateUpdateHandler = { state in
            switch state {
            case .ready:
                // Connection succeeded
                connection.cancel()
                DispatchQueue.main.async {
                    completion(true)
                }
                
            case .failed(let error):
                // Connection failed
                connection.cancel()
                DispatchQueue.main.async {
                    print("Connection verification failed: \(error)")
                    completion(false)
                }
                
            case .cancelled:
                // Connection was cancelled
                break
                
            default:
                // Other states (preparing, waiting, etc.)
                break
            }
        }
        
        // Start the connection attempt with a shorter timeout (1.5 seconds)
        connection.start(queue: .global())
        
        // Set shorter timeout for faster verification
        DispatchQueue.global().asyncAfter(deadline: .now() + 1.5) {
            if connection.state != .cancelled && connection.state != .ready {
                connection.cancel()
                DispatchQueue.main.async {
                    completion(false)
                }
            }
        }
    }
    
    private func scheduleDiscoveryRetry(immediate: Bool = false) {
        // Cancel any existing retry timer
        discoveryRetryTimer?.invalidate()
        
        // Increment retry count
        discoveryRetryCount += 1
        
        // Check if we've exceeded max retries
        if discoveryRetryCount > 3 {
            return
        }
        
        // Calculate backoff delay - simple exponential backoff
        // Use immediate retry for specific errors like defunct connections
        let delaySeconds = immediate ? 0.5 : 5.0 * pow(2.0, Double(discoveryRetryCount - 1))
        
        updateDiscoveryState(.restarting)
        
        // Schedule retry
        discoveryRetryTimer = Timer.scheduledTimer(withTimeInterval: delaySeconds, repeats: false) { [weak self] _ in
            guard let self = self else { return }
            
            if self.discoveryState == .restarting || self.discoveryState == .failed {
                self.startDiscovery()
            }
        }
    }
    
    private func startConnectionMonitoring() {
        // Cancel any existing monitoring
        connectionMonitorTimer?.invalidate()
        
        // Start periodic connection checks with shorter interval for faster disconnect detection
        connectionMonitorTimer = Timer.scheduledTimer(withTimeInterval: CONNECTION_CHECK_INTERVAL, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            
            if self.connectionState == .connected {
                self.checkConnectionHealth()
            }
        }
    }
    
    private func checkConnectionHealth() {
        checkCurrentConnection { [weak self] isConnected in
            guard let self = self else { return }
            
            if !isConnected && self.connectionState == .connected {
                // Connection lost - respond faster
                self.connectionMonitorTimer?.invalidate()
                self.updateConnectionState(.connectionLost)
                
                // Notify listeners with clear message
                self.notifyListeners("onAPConnectionLost", data: [
                    "status": "lost",
                    "message": "Connection to device network lost"
                ])
            }
        }
    }
    
    @objc func stopDiscoverDevices(_ call: CAPPluginCall) {
        // Only attempt to stop if we're in an active state
        guard discoveryState == .active || 
              discoveryState == .starting || 
              discoveryState == .restarting else {
            call.resolve(["success": true, "message": "Discovery not active"])
            return
        }
        
        updateDiscoveryState(.stopping)
        
        // Clean up discovery resources
        cleanupDiscovery()
        
        // Reset state variables
        discoveryRetryCount = 0
        updateDiscoveryState(.inactive)
        
        call.resolve(["success": true])
    }
    
    private func cleanupDiscovery() {
        // Cancel any existing retry timer
        discoveryRetryTimer?.invalidate()
        discoveryRetryTimer = nil
        
        // Stop browser if active
        if let browser = serviceBrowser {
            browser.cancel()
        }
        serviceBrowser = nil
    }
    
    @objc func checkDeviceConnection(_ call: CAPPluginCall) {
        DispatchQueue.global().async { [weak self] in
            self?.device.checkDeviceConnection(call: pluginCall(call: call))
        }
    }
    
    @objc func connectToDeviceAP(_ call: CAPPluginCall) {
        guard self.bridge != nil else { 
            call.reject("Could not access bridge")
            return
        }
        
        // Ensure we're in a valid state to start connection
        guard connectionState == .disconnected || 
              connectionState == .connectionFailed || 
              connectionState == .connectionLost else {
            call.resolve(["status": "error", "error": "Cannot connect in state: \(connectionState.rawValue)"])
            return
        }
        
        DispatchQueue.global().async { [weak self] in
            guard let self = self else { return }
            
            // First, check if already connected to bushnet
            self.checkCurrentConnection { isConnected in
                if isConnected {
                    self.updateConnectionState(.connected)
                    call.resolve(["status": "connected"])
                    
                    // Start connection monitoring
                    self.startConnectionMonitoring()
                    return
                }
                
                // Update state to connecting
                self.updateConnectionState(.connecting)
                
                // Cancel any existing timers
                self.connectionTimeoutTimer?.invalidate()
                self.verificationTimer?.invalidate()
                
                // Set connection timeout
                self.connectionTimeoutTimer = Timer.scheduledTimer(withTimeInterval: 45.0, repeats: false) { [weak self] _ in
                    guard let self = self else { return }
                    
                    if self.connectionState == .connecting || self.connectionState == .connectionVerifying {
                        self.updateConnectionState(.connectionFailed)
                        call.resolve(["status": "error", "error": "Connection timed out"])
                    }
                }
                
                self.configuration.joinOnce = false
                
                // If not connected, proceed with connection attempt
                NEHotspotConfigurationManager.shared.removeConfiguration(forSSID: "bushnet")
                
                NEHotspotConfigurationManager.shared.apply(self.configuration) { [weak self] error in
                    guard let self = self else { return }
                    
                    if let error = error {
                        self.connectionTimeoutTimer?.invalidate()
                        self.updateConnectionState(.connectionFailed)
                        call.resolve(["status": "error", "error": error.localizedDescription])
                        return
                    }
                    
                    // Connection initiated, now verify it
                    self.updateConnectionState(.connectionVerifying)
                    
                    // Verify the connection after a short delay
                    self.verificationTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] timer in
                        guard let self = self else {
                            timer.invalidate()
                            return
                        }
                        
                        self.checkCurrentConnection { isConnected in
                            if isConnected {
                                timer.invalidate()
                                self.connectionTimeoutTimer?.invalidate()
                                self.updateConnectionState(.connected)
                                call.resolve(["status": "connected"])
                                
                                // Start connection monitoring
                                self.startConnectionMonitoring()
                            }
                        }
                    }
                }
            }
        }
    }
    
    @objc func disconnectFromDeviceAP(_ call: CAPPluginCall) {
        guard let bridge = self.bridge else { 
            return call.reject("Could not access bridge") 
        }
        
        // Ensure we're in a connected state
        guard connectionState == .connected || connectionState == .connectionLost else {
            call.resolve(["success": true, "message": "Already disconnected"])
            return
        }
        
        // Update state to disconnecting
        updateConnectionState(.disconnecting)
        
        // Set a timeout for disconnection
        let disconnectTimeoutTimer = Timer.scheduledTimer(withTimeInterval: DISCONNECT_DETECTION_TIMEOUT, repeats: false) { [weak self] _ in
            guard let self = self else { return }
            
            if self.connectionState == .disconnecting {
                // Force disconnect state even if operation didn't complete properly
                self.updateConnectionState(.disconnected)
                call.resolve(["success": true, "message": "Disconnect timed out but state updated"])
                bridge.releaseCall(withID: call.callbackId)
            }
        }
        
        call.keepAlive = true
        
        // Stop connection monitoring
        connectionMonitorTimer?.invalidate()
        
        // Attempt to remove the Wi-Fi configuration for the SSID "bushnet"
        NEHotspotConfigurationManager.shared.removeConfiguration(forSSID: "bushnet")
        
        if #available(iOS 14.0, *) {
            NEHotspotNetwork.fetchCurrent { [weak self] (currentConfiguration) in
                guard let self = self else { return }
                
                disconnectTimeoutTimer.invalidate()
                
                if let currentSSID = currentConfiguration?.ssid, currentSSID == "bushnet" {
                    // The device is still connected to the "bushnet" network, disconnection failed
                    self.updateConnectionState(.connected) // Revert to connected state
                    call.resolve(["success": false, "error": "Failed to disconnect from the desired network"])
                } else {
                    // Successfully disconnected or was not connected to "bushnet"
                    self.updateConnectionState(.disconnected)
                    call.resolve(["success": true, "message": "Disconnected successfully"])
                }
                
                // Clean up any reference to the call if necessary
                bridge.releaseCall(withID: call.callbackId)
            }
        } else {
            // Fallback for earlier versions of iOS
            guard let interfaceNames = CNCopySupportedInterfaces() else {
                disconnectTimeoutTimer.invalidate()
                updateConnectionState(.disconnected) // Assume disconnected on error
                call.resolve(["success": false, "error": "No interfaces found"])
                bridge.releaseCall(withID: call.callbackId)
                return
            }
            
            guard let swiftInterfaces = (interfaceNames as NSArray) as? [String] else {
                disconnectTimeoutTimer.invalidate()
                updateConnectionState(.disconnected) // Assume disconnected on error
                call.resolve(["success": false, "error": "No interfaces found"])
                bridge.releaseCall(withID: call.callbackId)
                return
            }
            
            var foundBushnet = false
            
            for name in swiftInterfaces {
                guard let info = CNCopyCurrentNetworkInfo(name as CFString) as? [String: AnyObject] else {
                    continue
                }
                
                guard let ssid = info[kCNNetworkInfoKeySSID as String] as? String else {
                    continue
                }
                
                if ssid.contains("bushnet") {
                    foundBushnet = true
                    // The device is still connected to "bushnet", meaning disconnection failed
                    updateConnectionState(.connected) // Revert to connected state
                    call.resolve(["success": false, "error": "Failed to disconnect from the desired network"])
                    break
                }
            }
            
            if !foundBushnet {
                // Successfully disconnected or was not connected to "bushnet"
                disconnectTimeoutTimer.invalidate()
                updateConnectionState(.disconnected)
                call.resolve(["success": true, "message": "Disconnected successfully"])
            }
            
            bridge.releaseCall(withID: call.callbackId)
        }
    }
    
    @objc private func checkCurrentConnection(completion: @escaping (Bool) -> Void) {
        if #available(iOS 14.0, *) {
            NEHotspotNetwork.fetchCurrent { (currentConfiguration) in
                let isConnected = currentConfiguration?.ssid == "bushnet"
                completion(isConnected)
            }
        } else {
            // Fallback for iOS 13 and earlier
            guard let interfaceNames = CNCopySupportedInterfaces() as? [String] else {
                completion(false)
                return
            }
            
            for name in interfaceNames {
                guard let info = CNCopyCurrentNetworkInfo(name as CFString) as? [String: Any],
                      let ssid = info[kCNNetworkInfoKeySSID as String] as? String else {
                    continue
                }
                
                if ssid == "bushnet" {
                    completion(true)
                    return
                }
            }
            completion(false)
        }
    }
    
    // Helper function to extract service details from NWEndpoint
    private func extractServiceDetails(from endpoint: Network.NWEndpoint) -> (name: String, port: Int) {
        switch endpoint {
        case .service(let name, let type, let domain, let interface):
            // Try to resolve the port from TXT records or use default port
            // For Cacophony devices, port is typically 80
            return (name, 80)
            
        case .hostPort(let host, let port):
            // If we have a host/port endpoint
            let name = switch host {
            case .name(let hostname, _):
                hostname
            default:
                host.debugDescription
            }
            
            return (name, Int(port.rawValue))
            
        default:
            // Default fallback
            return (endpoint.debugDescription, 80)
        }
    }
    
    // Debug helper to print endpoint details
    private func logEndpointDetails(_ endpoint: Network.NWEndpoint) {
        switch endpoint {
        case .service(let name, let type, let domain, let interface):
            print("Service: name=\(name), type=\(type), domain=\(domain), interface=\(interface?.debugDescription ?? "nil")")
        case .hostPort(let host, let port):
            print("HostPort: host=\(host), port=\(port)")
        default:
            print("Unknown endpoint type: \(endpoint)")
        }
    }
    
    @objc func checkIsAPConnected(_ call: CAPPluginCall) {
        checkCurrentConnection { [weak self] isConnected in
            guard let self = self else {
                call.resolve(["connected": false])
                return
            }
            
            // Update internal state if needed
            if isConnected != self.lastKnownConnectionState {
                self.updateConnectionState(isConnected ? .connected : .disconnected)
                self.lastKnownConnectionState = isConnected
            }
            
            call.resolve(["connected": isConnected])
        }
    }
    
    @objc func turnOnModem(_ call: CAPPluginCall) {
        DispatchQueue.global().async { [weak self] in
            self?.device.turnOnModem(call: pluginCall(call: call))
        }
    }
    
    @objc func reregisterDevice(_ call: CAPPluginCall) {
        DispatchQueue.global().async { [weak self] in
            self?.device.reregister(call: pluginCall(call: call))
        }
    }
    
    @objc func getDeviceInfo(_ call: CAPPluginCall) {
        DispatchQueue.global().async { [weak self] in
            self?.device.getDeviceInfo(call: pluginCall(call: call))
        }
    }
    
    @objc func setDeviceConfig(_ call: CAPPluginCall) {
        DispatchQueue.global().async { [weak self] in
            self?.device.setDeviceConfig(call: pluginCall(call: call))
        }
    }
    
    @objc func getDeviceConfig(_ call: CAPPluginCall) {
        DispatchQueue.global().async { [weak self] in
            self?.device.getDeviceConfig(call: pluginCall(call: call))
        }
    }
    
    @objc func getDeviceLocation(_ call: CAPPluginCall) {
        DispatchQueue.global().async { [weak self] in
            self?.device.getDeviceLocation(call: pluginCall(call: call))
        }
    }
    
    @objc func setDeviceLocation(_ call: CAPPluginCall) {
        DispatchQueue.global().async { [weak self] in
            self?.device.setDeviceLocation(call: pluginCall(call: call))
        }
    }
    
    @objc func getRecordings(_ call: CAPPluginCall) {
        DispatchQueue.global().async { [weak self] in
            self?.device.getRecordings(call: pluginCall(call: call))
        }
    }
    
    @objc func getEvents(_ call: CAPPluginCall) {
        DispatchQueue.global().async { [weak self] in
            self?.device.getEvents(call: pluginCall(call: call))
        }
    }
    
    @objc func deleteEvents(_ call: CAPPluginCall) {
        DispatchQueue.global().async { [weak self] in
            self?.device.deleteEvents(call: pluginCall(call: call))
        }
    }
    
    @objc func getEventKeys(_ call: CAPPluginCall) {
        DispatchQueue.global().async { [weak self] in
            self?.device.getEventKeys(call: pluginCall(call: call))
        }
    }
    
    @objc func downloadRecording(_ call: CAPPluginCall) {
        DispatchQueue.global().async { [weak self] in
            self?.device.downloadRecording(call: pluginCall(call: call))
        }
    }
    
    @objc func deleteRecording(_ call: CAPPluginCall) {
        DispatchQueue.global().async { [weak self] in
            self?.device.deleteRecording(call: pluginCall(call: call))
        }
    }
    
    @objc func deleteRecordings(_ call: CAPPluginCall) {
        DispatchQueue.global().async { [weak self] in
            self?.device.deleteRecordings(call: pluginCall(call: call))
        }
    }
    
    @objc func updateRecordingWindow(_ call: CAPPluginCall) {
        DispatchQueue.global().async { [weak self] in
            self?.device.updateRecordingWindow(call: pluginCall(call: call))
        }
    }
    
    @objc func setLowPowerMode(_ call: CAPPluginCall) {
        DispatchQueue.global().async { [weak self] in
            self?.device.setLowPowerMode(call: pluginCall(call: call))
        }
    }
    
    @objc func unbindConnection(_ call: CAPPluginCall) {
        // Notify about the unbind event
        notifyListeners("onConnectionUnbound", data: [:])
        call.resolve()
    }
    
    @objc func rebindConnection(_ call: CAPPluginCall) {
        // Notify about the rebind event
        notifyListeners("onConnectionRebound", data: [:])
        call.resolve()
    }
    
    @objc func hasConnection(_ call: CAPPluginCall) {
        let networkMonitor = NWPathMonitor()
        let queue = DispatchQueue(label: "NetworkMonitor")
        
        networkMonitor.pathUpdateHandler = { path in
            networkMonitor.cancel()
            
            let isConnected = path.status == .satisfied
            
            DispatchQueue.main.async {
                call.resolve([
                    "success": true,
                    "connected": isConnected
                ])
            }
        }
        
        networkMonitor.start(queue: queue)
        
        // Set a timeout in case the network monitor doesn't respond
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
            networkMonitor.cancel()
            call.resolve([
                "success": false,
                "connected": false,
                "message": "Network check timed out"
            ])
        }
    }
    enum PermissionState: String {
        case granted
        case denied
        case prompt
    }
    
    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        // Use one of the app's main service types, e.g., the one used for actual discovery.
        // This avoids creating a listener with a UUID name just for a check.
        let serviceTypeToCheck = "_cacophonator-management._tcp"
        let queue = DispatchQueue(label: "LocalNetworkPermissionCheckQueue", qos: .userInitiated)
        
        var browser: NWBrowser?
        var callHasBeenResolved = false // Ensure call is resolved only once
        var resolutionTimer: Timer?

        // Utility to safely resolve the call on the main thread
        func resolveCall(granted: Bool, message: String? = nil) {
            DispatchQueue.main.async {
                if !callHasBeenResolved {
                    callHasBeenResolved = true
                    resolutionTimer?.invalidate()
                    browser?.cancel() // Ensure browser is cancelled
                    if let msg = message {
                        print("checkPermissions: \(msg)")
                    }
                    call.resolve(["granted": granted])
                }
            }
        }

        let parameters = NWParameters()
        parameters.includePeerToPeer = true // Often used for local peer discovery
        // parameters.requiredInterfaceType = .wifi // Consider if discovery is Wi-Fi only

        browser = NWBrowser(for: .bonjour(type: serviceTypeToCheck, domain: nil), using: parameters)

        browser?.stateUpdateHandler = { [weak browser] newState in
            // Ensure we don't act if already resolved
            guard !callHasBeenResolved else { return }

            switch newState {
            case .ready:
                resolveCall(granted: true, message: "Browser is .ready for \(serviceTypeToCheck)")
            case .failed(let error):
                var errorMessage = "Browser for \(serviceTypeToCheck) failed. Error: \(error.localizedDescription)"
                var permissionDeniedBySystem = false
                if let nwError = error as? NWError {
                    switch nwError {
                    case .dns(let dnsErrorType):
                        // kDNSServiceErr_PolicyDenied is -65549. This indicates permission was denied by the system.
                        if dnsErrorType == -65549 {
                            errorMessage = "Browser failed: DNS Policy Denied (\(dnsErrorType)) for \(serviceTypeToCheck)."
                            permissionDeniedBySystem = true
                        } else {
                            errorMessage = "Browser failed: DNS Error \(dnsErrorType) for \(serviceTypeToCheck)."
                        }
                    case .posix(let posixError):
                        // POSIX EPERM (1) or EACCES (13) can also indicate permission issues.
                        if posixError == .EPERM || posixError == .EACCES {
                            errorMessage = "Browser failed: POSIX Permission Error (\(posixError.rawValue)) for \(serviceTypeToCheck)."
                            permissionDeniedBySystem = true
                        } else if posixError == .ECANCELED {
                             // If we cancelled it (e.g., via timeout or after resolution), this is expected.
                             // If browser?.state is .cancelled, it means we likely initiated it.
                             // This path should ideally not be hit if callHasBeenResolved is checked.
                            print("Browser failed: POSIX Cancelled. Current browser state: \(String(describing: browser?.state)) for \(serviceTypeToCheck).")
                            return // Avoid generic failure resolution if it's our cancel or already handled.
                        } else {
                            errorMessage = "Browser failed: POSIX Error \(posixError.rawValue) for \(serviceTypeToCheck)."
                        }
                    default:
                        // Other NWError types
                        break
                    }
                }
                // If a specific permission denial error was identified, resolve false. Otherwise, it's a generic network failure.
                // For a permission check, any failure to become .ready might be treated as permission not available.
                resolveCall(granted: permissionDeniedBySystem, message: errorMessage)
            case .cancelled:
                // This state is usually hit after browser.cancel() is called (e.g. in resolveCall or timeout).
                // If hit before resolution, it implies an external cancellation or issue.
                resolveCall(granted: false, message: "Browser for \(serviceTypeToCheck) was cancelled before resolution.")
            case .waiting(let error):
                // Browser is waiting, possibly for the permission prompt if status is undetermined.
                if let currentError = error, case let NWError.dns(dnsErrorType) = currentError, dnsErrorType == -65549 {
                    resolveCall(granted: false, message: "Browser waiting: DNS Policy Denied (\(dnsErrorType)) for \(serviceTypeToCheck).")
                } else {
                    // Still waiting, don't resolve yet. Let timeout handle if it persists.
                    print("Browser for \(serviceTypeToCheck) is .waiting. Error (if any): \(String(describing: error))")
                }
            default:
                // Other states like .setup.
                break
            }
        }
        
        // Start browsing.
        browser?.start(queue: queue)

        // Timeout: If after a few seconds (e.g., 3-5s) we haven't definitively resolved,
        // assume permission is not granted or the prompt is taking too long / user isn't interacting.
        // The system's permission prompt is modal.
        resolutionTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: false) { _ in
            // This timer runs on the main thread, dispatch to queue for browser state check if needed,
            // but resolveCall handles main thread dispatch for CAPPluginCall.
            if !callHasBeenResolved {
                var msg = "Timeout (3s) reached for \(serviceTypeToCheck) permission check."
                // We need to check browser state on its queue or ensure thread safety if accessing directly.
                // For simplicity, just resolve.
                // If browser?.state was .waiting, the prompt might have been up.
                msg += " Assuming permission not granted or prompt not acted upon."
                resolveCall(granted: false, message: msg)
            }
        }
        call.keepAlive = true // Keep Capacitor call alive until we explicitly resolve it.
    }
}

class LocalNetworkPrivacy : NSObject {
    let service: NetService

    var completion: ((Bool) -> Void)?
    var timer: Timer?
    var publishing = false
    
    override init() {
        service = .init(domain: "local.", type:"_lnp._tcp.", name: "LocalNetworkPrivacy", port: 1100)
        super.init()
    }
    
    @objc
    func checkAccessState(completion: @escaping (Bool) -> Void) {
        self.completion = completion
        
        timer = .scheduledTimer(withTimeInterval: 2, repeats: true, block: { timer in
            guard UIApplication.shared.applicationState == .active else {
                return
            }
            
            if self.publishing {
                self.timer?.invalidate()
                self.completion?(false)
            }
            else {
                self.publishing = true
                self.service.delegate = self
                self.service.publish()
                
            }
        })
    }
    
    deinit {
        service.stop()
    }
}

extension LocalNetworkPrivacy : NetServiceDelegate {
    
    func netServiceDidPublish(_ sender: NetService) {
        timer?.invalidate()
        completion?(true)
    }
}
