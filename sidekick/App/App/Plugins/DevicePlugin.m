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
           CAP_PLUGIN_METHOD(getDeviceConnection, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(getDeviceInfo, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(getDeviceConfig, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(setDeviceLocation, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(getRecordings, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(getTestText, CAPPluginReturnPromise);
           
)
