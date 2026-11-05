import type { CapacitorConfig } from '@capacitor/cli';

// The iOS and Android apps package the web build (ADR 0036). `npm run sync`
// builds it into ./www against the hosted API and copies it into both projects.
const config: CapacitorConfig = {
  // Permanent once the app is registered with Apple and Google.
  appId: 'ro.vrancianu.pantrygator',
  appName: 'PantryGator',
  webDir: 'www',
};

export default config;
