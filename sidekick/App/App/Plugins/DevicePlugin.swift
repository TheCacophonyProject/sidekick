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

let type = "_cacophonator-management._tcp"
let domain = "local."

@objc(DevicePlugin)
public class DevicePlugin: CAPPlugin {
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
    var isConnected = false;
    
    private var callQueue: [String: CallType] = [:]
    func createBrowser() -> NWBrowser {
        return NWBrowser(for: .bonjour(type: type, domain: domain), using: .tcp)
    }
    var serviceBrowser: NWBrowser?
    
    @objc func discoverDevices(_ call: CAPPluginCall) {
        call.keepAlive = true
        callQueue[call.callbackId] = .discover
        // check if we has network permissions iOS for 13+
        requestPermissions(call)


        serviceBrowser = createBrowser()

        serviceBrowser?.browseResultsChangedHandler = {(res: Set<NWBrowser.Result>, old: Set<NWBrowser.Result.Change>) -> Void in
            res.forEach { service in
                call.resolve(["endpoint": service.endpoint.debugDescription])
            }
        }
        serviceBrowser?.start(queue: .global())
    }
    @objc func stopDiscoverDevices(_ call: CAPPluginCall) {
        guard let bridge = self.bridge else { return call.reject("Could not access bridge") }
        guard let id = call.getString("id") else { return call.reject("No Id Found")}
        bridge.releaseCall(withID: id)
        serviceBrowser?.cancel()
        call.resolve(["success": true, "id": id])
    }
    @objc func checkDeviceConnection(_ call: CAPPluginCall) {
        device.checkDeviceConnection(call: pluginCall(call: call))
    }

    
    @objc func connectToDeviceAP(_ call: CAPPluginCall) {
        guard let bridge = self.bridge else { return call.reject("Could not access bridge") }
        call.keepAlive = true
        callQueue[call.callbackId] = .discover
        NEHotspotConfigurationManager.shared.removeConfiguration(forSSID: "bushnet")
        configuration.joinOnce = true
        
        NEHotspotConfigurationManager.shared.apply(configuration) { error in
            if let error = error {
                call.resolve(["success": false, "error": "\(error.localizedDescription)"])
                bridge.releaseCall(withID: call.callbackId)
                return
            }
        }
        if #available(iOS 14.0, *) {
            NEHotspotNetwork.fetchCurrent { (currentConfiguration) in
                if let currentSSID = currentConfiguration?.ssid, currentSSID == "bushnet" {
                    // Successfully connected to the desired network
                    call.resolve(["success": true, "data": "connected"])
                } else {
                    // The device might have connected to a different network
                    call.resolve(["success": false, "error": "Did not connect to the desired network"])
                }
            }
        } else {
            // Fallback on earlier versions
            guard let interfaceNames = CNCopySupportedInterfaces() as? [String] else {
                call.resolve(["success": false, "error": "No interfaces found"])
                return
            }
            
            let val = interfaceNames.compactMap { name in
                guard let info = CNCopyCurrentNetworkInfo(name as CFString) as? [String: AnyObject] else {
                    return nil
                }
                
                guard let ssid = info[kCNNetworkInfoKeySSID as String] as? String else {
                    return nil
                }
                return ssid
            })
            if val.contains("bushnet") {
                call.resolve(["success": true, "data": "connected"])
            } else {
                call.resolve(["success": false, "error": "Did not connect to the desired network"])
            }
        }
    }

    
    @objc func getDeviceInfo(_ call: CAPPluginCall) {
        device.getDeviceInfo(call: pluginCall(call: call))
    }
    
    @objc func getDeviceConfig(_ call: CAPPluginCall) {
        device.getDeviceConfig(call: pluginCall(call: call))
    }
    
    @objc func getDeviceLocation(_ call: CAPPluginCall) {
        device.getDeviceLocation(call: pluginCall(call: call))
    }
    
    @objc func setDeviceLocation(_ call: CAPPluginCall) {
        device.setDeviceLocation(call: pluginCall(call: call))
    }

    @objc func getRecordings(_ call: CAPPluginCall) {
        device.getRecordings(call: pluginCall(call: call))
    }
    
    @objc func getEvents(_ call: CAPPluginCall) {
        device.getEvents(call: pluginCall(call: call))
    }
    @objc func deleteEvents(_ call: CAPPluginCall) {
        device.deleteEvents(call: pluginCall(call: call))
    }
    @objc func getEventKeys(_ call: CAPPluginCall) {
        device.getEventKeys(call: pluginCall(call: call))
    }
    
    @objc func downloadRecording(_ call: CAPPluginCall) {
        device.downloadRecording(call: pluginCall(call: call))
    }
    
    @objc func deleteRecording(_ call: CAPPluginCall) {
        device.deleteRecording(call: pluginCall(call: call))
    }
    
    @objc func deleteRecordings(_ call: CAPPluginCall) {
        device.deleteRecordings(call: pluginCall(call: call))
    }

    @objc func updateRecordingWindow(_ call: CAPPluginCall) {
        device.updateRecordingWindow(call: pluginCall(call: call))
    }
    
    @objc func unbindConnection(_ call: CAPPluginCall) {
        call.resolve()
    }
    
    @objc func rebindConnection(_ call: CAPPluginCall) {
        call.resolve()
    }
    
    @objc func hasConnection(_ call: CAPPluginCall) {
        if #available(iOS 14.0, *) {
            NEHotspotNetwork.fetchCurrent { (currentConfiguration) in
                if let currentSSID = currentConfiguration?.ssid, currentSSID == "bushnet" {
                    // Successfully connected to the desired network
                    call.resolve(["success": true, "data": "connected"])
                } else {
                    // The device might have connected to a different network
                    call.resolve(["success": false, "error": "Did not connect to the desired network"])
                }
            }
        } else {
            // Fallback on earlier versions
            call.resolve(["success": true, "data": "default"])
        }
    }
}
