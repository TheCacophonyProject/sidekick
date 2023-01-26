//
//  DevicePlugin.swift
//  App
//
//  Created by Patrick Baxter on 13/12/22.
//

import Network
import Capacitor
import shared

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
    @objc let device = DeviceInterface()
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
        call.resolve(["result": "success", "id": id])
    }
    @objc func getDeviceConnection(_ call: CAPPluginCall) {
        guard let name = call.getString("name") else { return call.reject("Device name required")}
        
        let connection = NWConnection.init(to: NWEndpoint.service(name: name, type: type, domain: domain, interface: .none), using: .tcp)
        connection.stateUpdateHandler = {(state: NWConnection.State) in
            if state == .ready, let innerEnpoint = connection.currentPath?.remoteEndpoint, case .hostPort(let host, let port) = innerEnpoint {
                print(host, port)
                connection.cancel()
                call.resolve(["result":"success", "data":["host": host.debugDescription.replacingOccurrences(of: "%en0", with: ""), "port": port.debugDescription]])
            }
        }

        connection.start(queue: .global())
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) {
            if (connection.state != .cancelled) {
                connection.cancel()
                call.resolve(["result":"error", "error": "Could not connect to device"])
            }
        }
    }
    
    @objc func getDeviceInfo(_ call: CAPPluginCall) {
        device.getDeviceInfo(call: pluginCall(call: call))
    }
    
    @objc func getDeviceConfig(_ call: CAPPluginCall) {
        device.getDeviceConfig(call: pluginCall(call: call))
    }
    
    @objc func setDeviceLocation(_ call: CAPPluginCall) {
        device.setDeviceLocation(call: pluginCall(call: call))
    }

    @objc func getRecordings(_ call: CAPPluginCall) {
        device.getRecordings(call: pluginCall(call: call))
    }
    
    @objc func getTestText(_ call: CAPPluginCall) {
        device.getTestText(call: pluginCall(call: call))
    }
}
