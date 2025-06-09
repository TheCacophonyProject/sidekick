//
//  PluginCall.swift
//  App
//
//  Created by Patrick Baxter on 12/12/22.
//

import Capacitor
import shared

class pluginCall: shared.PluginCall {
    let call: CAPPluginCall
    init(call: CAPPluginCall) {
        self.call = call
    }
    
    func setKeepAlive(keepAlive: Bool) {
        call.keepAlive = true
    }

    func reject(message: String) {
        call.reject(message)
    }
    func resolve(data: [String : Any]) {
        call.resolve(data)
    }
    func getString(key: String) -> String? {
        call.getString(key)
    }
    
    func getDataAsJsonString() -> String? {
        // Get all options from the call and convert to JSON string
        guard let dict = call.jsObjectRepresentation else {
            return nil
        }
        
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: dict, options: [])
            return String(data: jsonData, encoding: .utf8)
        } catch {
            print("Error converting to JSON: \(error)")
            return nil
        }
    }
    
    func notifyListeners(eventName: String, data: [String : Any]) {
        // Get the plugin instance from the call
        if let plugin = call.getPlugin() as? CAPPlugin {
            plugin.notifyListeners(eventName, data: data)
        }
    }
}
