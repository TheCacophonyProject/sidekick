//
//  DevicePlugin.m
//  App
//
//  Created by Patrick Baxter on 14/12/22.
//

#import <Capacitor/Capacitor.h>

CAP_PLUGIN(DevicePlugin, "Device",
           CAP_PLUGIN_METHOD(discoverDevices, CAPPluginReturnCallback);
           CAP_PLUGIN_METHOD(stopDiscoverDevices, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(checkDeviceConnection, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(getDeviceInfo, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(getDeviceConfig, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(connectToDeviceAP, CAPPluginReturnCallback);
           CAP_PLUGIN_METHOD(getDeviceLocation, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(setDeviceLocation, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(getRecordings, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(getEvents, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(deleteEvents, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(getEventKeys, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(deleteRecording, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(deleteRecordings, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(downloadRecording, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(updateRecordingWindow, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(unbindConnection, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(rebindConnection, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(hasConnection, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(disconnectFromDeviceAP, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(turnOnModem, CAPPluginReturnPromise);
)
