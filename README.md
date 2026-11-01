# Janu AI — Personal AI Voice Assistant

**Developer:** Poran  
**Platform:** Android (Capacitor + Native Java Plugin) & Online Web Assistant  
**Languages:** Bengali (`বাংলা`) & Hindi (`हिन्दी`)

Janu AI is an online, voice-controlled personal AI assistant built with React, TypeScript, Tailwind CSS, Express, Gemini (`@google/genai`), and Capacitor Android. It features Janu AI's official full-body character identity, real-time Bengali and Hindi speech recognition and 100% female voice synthesis, an action confirmation & multi-contact disambiguation system, user-approved memory storage, five customizable themes, and native Android phone control integration.

---

## Project Structure

```text
├── .env.example                                  # Environment variable template (no real keys)
├── .github/workflows/build-android-apk.yml       # Automated GitHub Actions Android APK builder
├── android/                                      # Complete Capacitor Android project + Java plugin
│   ├── app/build.gradle                          # Android Gradle config + release signingConfig
│   └── app/src/main/
│       ├── AndroidManifest.xml                   # Android permissions, package queries & DeviceAdmin
│       ├── java/com/poran/piyaai/
│       │   ├── MainActivity.java                 # Capacitor BridgeActivity registering plugin
│       │   ├── PiyaDeviceAdminReceiver.java      # DevicePolicyManager lock receiver
│       │   └── PiyaDeviceControlPlugin.java      # Native bridge for calls, apps, torch, lock, alarms
│       └── res/xml/device_admin_policies.xml     # Force-lock policy definition
├── capacitor.config.ts                           # Capacitor configuration (com.poran.piyaai)
├── index.html                                    # App HTML entry point
├── metadata.json                                 # App metadata & capabilities
├── package.json                                  # Scripts & dependencies
├── public/assets/aistudio/                       # Official Janu AI main character image asset
├── server.ts                                     # Express backend securing Gemini API calls
└── src/
    ├── App.tsx                                   # Main screen & full-screen assistant orchestrator
    ├── components/
    │   ├── AssistantFullScreen.tsx               # Full-screen character & confirmation dock
    │   ├── MemoryVaultPanel.tsx                  # User-approved preference & history manager
    │   ├── PhoneActionsPanel.tsx                 # Contacts, YouTube, battery, torch, alarms & notes
    │   ├── PiyaCharacter3D.tsx                   # Official full-body character & voice-reactive stage
    │   ├── ProfileModal.tsx                      # User & developer identity, logout & data wipe
    │   └── SettingsModal.tsx                     # Language, voice, speed, 5 themes & privacy settings
    ├── constants/themesAndCopy.ts                # 5 themes, Bengali/Hindi strings & voice parser
    ├── services/
    │   ├── androidBridge.ts                      # Capacitor & Web hardware action bridge
    │   └── voiceEngine.ts                        # Microphone capture, STT, neural TTS & lip-sync
    └── types/piya.ts                             # TypeScript definitions
```

---

## Security & Secret Protection

- **Zero Exposed API Keys:** `GEMINI_API_KEY` is accessed strictly inside `server.ts` on the backend and is never bundled into frontend code or the Android APK.
- **Git Secret Exclusion:** `.gitignore` blocks `.env*` (except `.env.example`), `*.jks`, `*.keystore`, `keystore.properties`, `android/local.properties`, and private keys/tokens from ever being committed.
- **Explicit Permissions:** Microphone, Contacts, Phone Call, Flashlight, and Device Administrator screen lock permissions are requested only when explicitly invoked and confirmed by the user.

---

## Running Locally

1. Copy `.env.example` to `.env` and set your `GEMINI_API_KEY` on the server:
   ```bash
   cp .env.example .env
   ```
2. Install dependencies and start the full-stack server on port `3000`:
   ```bash
   npm install
   npm run dev
   ```

---

## Building the Android APK

### Option 1: Automatic APK Build on GitHub (Included)
Every push to `main` runs `.github/workflows/build-android-apk.yml` on GitHub Actions, which compiles the web bundle, syncs Capacitor Android, runs `./gradlew assembleDebug` (and signed `assembleRelease` if signing secrets are added in GitHub Settings > Secrets), and publishes `Janu-AI-debug.apk` under **Actions > Artifacts**.

### Option 2: Local Signed APK Build via Android Studio / Gradle
```bash
npm run build
npx cap sync android
cd android
./gradlew assembleRelease
```
To sign locally without committing secrets, create `android/keystore.properties` (ignored by Git):
```properties
storeFile=piya-release.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=piya
keyPassword=YOUR_KEY_PASSWORD
```
