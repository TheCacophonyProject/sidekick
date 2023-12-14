import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "nz.org.cacophony.sidekick",
  appName: "Sidekick",
  webDir: "dist",
  bundledWebRuntime: false,
  backgroundColor: "#f9fafb",
  server: {
    hostname: "cacophony.org.nz",
    androidScheme: "https",
  },
  android: {
    path: "sidekick",
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
  },
};

export default config;
