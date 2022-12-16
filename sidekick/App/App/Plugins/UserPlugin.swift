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
        user.authenticateUser(call: PluginCall(call: call))
    }
}
