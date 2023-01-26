//
//  DashboardPlugin.swift
//  App
//
//  Created by Patrick Baxter on 29/11/22.
//

import Capacitor
import shared

@objc(UserPlugin)
public class UserPlugin: CAPPlugin {
    let user = UserInterface()
    @objc func authenticateUser(_ call: CAPPluginCall) {
        user.authenticateUser(call: pluginCall(call: call))
    }
    @objc func requestDeletion(_ call: CAPPluginCall) {
        user.requestDeletion(call: pluginCall(call: call))
    }
    @objc func validateToken(_ call: CAPPluginCall) {
        user.validateToken(call: pluginCall(call: call))
    }
    @objc func setToTestServer(_ call: CAPPluginCall) {
        user.setToTestServer(call: pluginCall(call: call))
    }
    @objc func setToProductionServer(_ call: CAPPluginCall) {
        user.setToProductionServer(call: pluginCall(call: call))
    }
}
