//
//  PluginCall.swift
//  App
//
//  Created by Patrick Baxter on 12/12/22.
//

import Capacitor
import shared

class PluginCall: shared.PluginCall {
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
}
