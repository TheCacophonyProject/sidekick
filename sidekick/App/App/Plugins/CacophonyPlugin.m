//
//  UserPlugin.m
//  App
//
//  Created by Patrick Baxter on 29/11/22.
//

#import <Capacitor/Capacitor.h>

CAP_PLUGIN(CacophonyPlugin, "Cacophony",
    CAP_PLUGIN_METHOD(authenticateUser, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(requestDeletion, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(validateToken, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(setToTestServer, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(setToProductionServer, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(uploadRecording, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(uploadEvent, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getAppVersion, CAPPluginReturnPromise);
)
