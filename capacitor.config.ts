import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bostonbijold.beone',
  appName: 'Be One',
  webDir: 'public',
  server: {
    url: 'https://be-one-nu.vercel.app',
    cleartext: false,
    allowNavigation: ['accounts.google.com']
  },
  ios: {
    backgroundColor: '#ffffff'
  },
  plugins: {
    SplashScreen: {
      backgroundColor: '#ffffff',
      showSpinner: false
    },
    StatusBar: {
      style: 'dark'
    }
  }
};

export default config;
