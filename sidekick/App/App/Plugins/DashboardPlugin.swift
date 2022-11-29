//
//  DashboardPlugin.swift
//  App
//
//  Created by Patrick Baxter on 29/11/22.
//

import Capacitor
import shared

@objc(DashboardPlugin)
public class DashboardPlugin: CAPPlugin {
    @objc func getTest(_ call: CAPPluginCall) {
        call.resolve(["test": Dashboard().test()])
    }
}
