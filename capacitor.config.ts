import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "nz.org.cacophony.sidekick",
  appName: "Sidekick",
  webDir: "dist",
  bundledWebRuntime: false,
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
    },
  },
};

export default config;
