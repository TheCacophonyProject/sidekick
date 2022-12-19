//
//  DevicePlgin.m
//  App
//
//  Created by Patrick Baxter on 14/12/22.
//

#import <Capacitor/Capacitor.h>

CAP_PLUGIN(DevicePlugin, "Device",
           CAP_PLUGIN_METHOD(discoverDevices, CAPPluginReturnCallback);
           CAP_PLUGIN_METHOD(stopDiscoverDevices, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(getDeviceConnection, CAPPluginReturnCallback);

)
