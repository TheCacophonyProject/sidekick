//
//  DashboardPlugin.m
//  App
//
//  Created by Patrick Baxter on 29/11/22.
//

#import <Capacitor/Capacitor.h>

CAP_PLUGIN(DashboardPlugin, "Dashboard",
    CAP_PLUGIN_METHOD(getTest, CAPPluginReturnPromise);
)
