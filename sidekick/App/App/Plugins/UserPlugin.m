//
//  UserPlugin.m
//  App
//
//  Created by Patrick Baxter on 29/11/22.
//

#import <Capacitor/Capacitor.h>

CAP_PLUGIN(UserPlugin, "User",
    CAP_PLUGIN_METHOD(authenticateUser, CAPPluginReturnPromise);
)
