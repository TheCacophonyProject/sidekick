import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'nz.org.cacophony.sidekick',
  appName: 'sidekick-app',
  webDir: 'dist/public',
  bundledWebRuntime: false,
  android: {
    path: 'sidekick',
    useLegacyBridge: false
  },
  ios: {
    path: 'sidekick'
  }
};

export default config;
