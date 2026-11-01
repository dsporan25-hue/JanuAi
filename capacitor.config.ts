import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.poran.piyaai",
  appName: "Janu AI",
  webDir: "dist",
  server: {
    androidScheme: "https",
    // Point to your deployed Cloud Run / HTTPS backend so GEMINI_API_KEY never enters the APK
    url: process.env.APP_URL || undefined,
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
