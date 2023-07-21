//
//  DashboardPlugin.swift
//  App
//
//  Created by Patrick Baxter on 29/11/22.
//

import Capacitor
import shared
var documentPath = String(FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].absoluteString.dropFirst(7));
@objc(CacophonyPlugin)
public class CacophonyPlugin: CAPPlugin {
    @objc let cacophony = CacophonyInterface(filePath: documentPath)

    @objc func authenticateUser(_ call: CAPPluginCall) {
        cacophony.authenticateUser(call: pluginCall(call: call))
    }
    @objc func requestDeletion(_ call: CAPPluginCall) {
        cacophony.requestDeletion(call: pluginCall(call: call))
    }
    @objc func validateToken(_ call: CAPPluginCall) {
        cacophony.validateToken(call: pluginCall(call: call))
    }
    @objc func setToTestServer(_ call: CAPPluginCall) {
        cacophony.setToTestServer(call: pluginCall(call: call))
    }
    @objc func setToProductionServer(_ call: CAPPluginCall) {
        cacophony.setToProductionServer(call: pluginCall(call: call))
    }
    @objc func uploadRecording(_ call: CAPPluginCall) {
        cacophony.uploadRecording(call: pluginCall(call: call))
    }
    @objc func uploadEvent(_ call:CAPPluginCall) {
        cacophony.uploadEvent(call: pluginCall(call: call))
    }
    @objc func getAppVersion(_ call: CAPPluginCall) {
        if let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String {
            call.resolve(["data": version, "success" : true])
        } else {
            call.resolve(["data": "1.0", "success" : true])
        }
    }
}
