# PennyWise - Mobile App (Capacitor & Android) Guide

This guide explains how to build and run **PennyWise** as a native Android app (`.apk`) using **Capacitor**, while maintaining full support for the web app and PWA.

---

## 📱 App Configuration

* **App Name:** PennyWise
* **Package ID / App ID:** `com.pennywise.app`
* **Web Directory:** `dist`
* **Config File:** [`capacitor.config.ts`](./capacitor.config.ts)
* **Android Project Path:** [`android/`](./android/)

---

## ⚡ Quick Reference Commands

All commands can be run from the root project folder:

```bash
# 1. Build the web app and copy changes to the Android native folder
npm run cap:build

# 2. Sync plugins and assets to Android without rebuilding web
npm run cap:sync

# 3. Open the native Android project in Android Studio
npm run cap:open

# 4. (Direct Command Line) Build Debug APK without opening Android Studio
cd android && gradlew.bat assembleDebug && cd ..
```

---

## 🛠️ Prerequisites

To compile the Android APK on your machine, you need:

1. **Node.js**: Version 18+ (already installed).
2. **Java Development Kit (JDK)**: JDK 17 or JDK 21 (recommended for Android Gradle Plugin).
   * Verify by running: `java -version`
   * Set `JAVA_HOME` environment variable to your JDK path if needed.
3. **Android Studio & Android SDK**:
   * Install [Android Studio](https://developer.android.com/studio).
   * Open Android Studio -> **SDK Manager** -> install **Android SDK Command-line Tools**, **Android SDK Platform 34 (or latest)**, and **Android SDK Build-Tools**.

---

## 🚀 Step-by-Step: How to Build the `.apk`

### Option 1: Build Debug APK via Command Line (Fastest)

1. **Build and sync the latest code:**
   ```bash
   npm run cap:build
   ```

2. **Run Gradle to build the APK:**
   * In PowerShell / Command Prompt:
     ```powershell
     cd android
     .\gradlew.bat assembleDebug
     cd ..
     ```

3. **Find your `.apk` file:**
   The output APK will be generated at:
   ```
   android/app/build/outputs/apk/debug/app-debug.apk
   ```
   You can transfer this `.apk` directly to your Android device via USB, Google Drive, or WhatsApp, and install it.

---

### Option 2: Build & Run via Android Studio (GUI)

1. **Sync project and launch Android Studio:**
   ```bash
   npm run cap:open
   ```

2. **Inside Android Studio:**
   * Wait for Gradle sync to complete (shown in the bottom status bar).
   * To test in an **Emulator** or **Physical Phone** (connected via USB with USB Debugging enabled): Click the green **Run (▶)** button.
   * To export the standalone `.apk`:
     1. Click menu **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**.
     2. A notification will appear in the bottom-right corner when finished: click **locate** to open the folder containing `app-debug.apk`.

---

## 🔄 Daily Development Workflow

When you modify React components in `src/`:

1. **Test in Browser (Web/PWA):**
   ```bash
   npm run dev
   ```
2. **Push Changes to Mobile App:**
   ```bash
   npm run cap:build
   ```
3. **Rebuild APK or refresh in Android Studio:**
   * Run `cd android && .\gradlew.bat assembleDebug` or click Run in Android Studio.

---

## 🌐 Live-Reload on Device / Emulator (Optional)

To see changes on your Android device in real time without rebuilding every time:

1. Find your computer's local IP address (e.g., `192.168.1.5` via `ipconfig`).
2. Start the Vite dev server with `--host`:
   ```bash
   npm run dev -- --host
   ```
3. In [`capacitor.config.ts`](./capacitor.config.ts), temporarily configure the server URL:
   ```ts
   const config: CapacitorConfig = {
     appId: 'com.pennywise.app',
     appName: 'PennyWise',
     webDir: 'dist',
     server: {
       url: 'http://192.168.1.5:5173',
       cleartext: true
     }
   };
   ```
4. Run `npm run cap:sync` and launch the app on your phone. Changes will update instantly via HMR!
*(Remember to remove the `server` block before building the final release APK).*

---

## 📦 How to Build a Release APK (Signed)

For sharing with other users or uploading to Google Play:

1. In Android Studio, go to **Build** > **Generate Signed Bundle / APK...**
2. Choose **APK** (for direct download) or **Android App Bundle (AAB)** (for Google Play).
3. Create or select your keystore key.
4. Select `release` build variant and click **Finish**.
5. The signed APK will be output in `android/app/release/`.

---

## ⚙️ How PWA & Native Work Together

* **Web Deployment (PWA):** Upload the `dist/` directory to Vercel, Netlify, or your web host. Users can visit the URL and click **"Install / Add to Home Screen"**.
* **Native App (APK):** The Android wrapper runs the same bundle inside an optimized native WebView, with direct access to hardware and offline storage.
