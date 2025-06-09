/// <reference types="@capacitor/local-notifications" />

import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
	appId: "nz.org.cacophony.sidekick",
	appName: "Sidekick",
	webDir: "dist",
	backgroundColor: "#f9fafb",
	server: {
		hostname: "sidekick.cacophony.org.nz",
		androidScheme: "https",
	},
	android: {
		path: "sidekick",
		allowMixedContent: true, // Add this line to allow mixed content
	},
	ios: {
		path: "sidekick",
	},
	plugins: {
		CapacitorHttp: {
			enabled: true,
		},
		CapacitorSQLite: {
			iosDatabaseLocation: "Library/CapacitorDatabase",
			androidIsEncryption: false,
			androidBiometric: {
				biometricAuth: false,
				biometricTitle: "Biometric login for capacitor sqlite",
				biometricSubTitle: "Log in using your biometric",
			},
		},
		LocalNotifications: {
			smallIcon: "ic_stat_notify_upload", // Ensure this drawable exists
			iconColor: "#488AFF",
			// sound: "beep.wav", // Optional: Add if you have a sound file in res/raw
		},
	},
};

export default config;
