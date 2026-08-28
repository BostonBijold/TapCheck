import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bostonbijold.tapcheck',
  appName: 'TapCheck',
  webDir: 'public',
  server: {
    url: 'https://tap-check.vercel.app',
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
