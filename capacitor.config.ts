import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'nz.org.cacophony.sidekick',
  appName: 'Sidekick',
  webDir: 'dist/public',
  bundledWebRuntime: false,
  android: {
    path: 'sidekick',
    useLegacyBridge: false
  },
  ios: {
    path: 'sidekick'
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }

  // server: {
  //   url: "http://192.168.86.33:3000",
  // },
};

export default config;