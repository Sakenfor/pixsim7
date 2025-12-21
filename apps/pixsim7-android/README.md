# PixSim Agent for Android

Minimal Android app to connect your phone to PixSim automation platform.

## Features

- 🔗 **Easy Pairing**: Simple pairing code flow
- 📱 **Device Discovery**: Auto-detects connected Android devices via ADB
- 🔄 **Background Sync**: Keeps devices synced via heartbeat
- 🪶 **Lightweight**: ~2-3 MB APK size

## Prerequisites

1. **Android Studio** (latest version recommended)
   - Download: https://developer.android.com/studio

2. **Java Development Kit (JDK) 17+**
   - Included with Android Studio

## Quick Start

### 1. Configure Backend URL

Before building, update the API URL in two files:

**File: `app/src/main/java/com/pixsim/agent/MainActivity.kt`**
```kotlin
// Line 15 - Replace with your backend URL
apiClient = ApiClient("https://YOUR-BACKEND-URL.com")
```

**File: `app/src/main/java/com/pixsim/agent/HeartbeatService.kt`**
```kotlin
// Line 20 - Replace with your backend URL
apiClient = ApiClient("https://YOUR-BACKEND-URL.com")
```

### 2. Build the App

#### Option A: Using Android Studio (GUI)

1. Open Android Studio
2. Click **File → Open**
3. Navigate to `pixsim-agent-android` folder
4. Wait for Gradle sync to complete (may take 2-5 minutes first time)
5. Click **Build → Build Bundle(s) / APK(s) → Build APK(s)**
6. APK will be at: `app/build/outputs/apk/debug/app-debug.apk`

#### Option B: Using Command Line

```bash
cd pixsim-agent-android

# Linux/Mac
./gradlew assembleDebug

# Windows
gradlew.bat assembleDebug
```

APK location: `app/build/outputs/apk/debug/app-debug.apk`

### 3. Install on Phone

#### Via USB Cable (Recommended)

```bash
# Enable USB debugging on your phone first!
# Settings → Developer Options → USB Debugging

# Install APK
adb install app/build/outputs/apk/debug/app-debug.apk
```

#### Via File Transfer

1. Copy `app-debug.apk` to your phone
2. Open file on phone
3. Allow "Install from unknown sources" if prompted
4. Tap "Install"

## Usage

1. **Open App** on your Android phone
2. **Tap "Connect to PixSim"**
3. **Note the pairing code** (e.g., "A1B2-C3D4")
4. **Go to pixsim.com** in your web browser
5. **Enter the code** in the automation section
6. **Wait for "Connected successfully!"**

The app now runs in the background and keeps your devices synced!

## Project Structure

```
pixsim-agent-android/
├── app/
│   ├── src/main/
│   │   ├── java/com/pixsim/agent/
│   │   │   ├── MainActivity.kt          # Pairing screen
│   │   │   ├── ApiClient.kt             # Backend communication
│   │   │   ├── DeviceScanner.kt         # ADB device detection
│   │   │   └── HeartbeatService.kt      # Background worker
│   │   ├── res/
│   │   │   ├── layout/
│   │   │   │   └── activity_main.xml    # UI layout
│   │   │   └── values/
│   │   │       ├── colors.xml
│   │   │       ├── strings.xml
│   │   │       └── themes.xml
│   │   └── AndroidManifest.xml
│   └── build.gradle.kts
├── build.gradle.kts
├── settings.gradle.kts
└── README.md
```

## How It Works

1. **Pairing Flow**:
   - App generates unique agent ID
   - Requests pairing code from backend (`/automation/agents/request-pairing`)
   - Polls status every 3 seconds (`/automation/agents/pairing-status/{id}`)
   - When user enters code, backend marks agent as paired

2. **Background Sync**:
   - `HeartbeatService` starts after successful pairing
   - Scans local ADB devices every 30 seconds
   - Sends heartbeat to backend (`/automation/agents/{id}/heartbeat`)
   - Backend updates device status in database

3. **ADB Integration**:
   - Uses JADB library for ADB communication
   - Detects USB/WiFi connected devices
   - Reports device serial and state

## Troubleshooting

### Build fails with "SDK not found"

**Solution**: Open Android Studio → Tools → SDK Manager → Install Android SDK 34

### "INTERNET permission denied"

**Solution**: Check `AndroidManifest.xml` includes `<uses-permission android:name="android.permission.INTERNET" />`

### No devices detected

**Solution**:
- Enable USB debugging on connected devices
- Start ADB daemon: `adb start-server`
- Check USB cable supports data transfer

### Pairing code request fails

**Solution**:
- Verify backend URL is correct
- Check network connectivity
- Backend must be accessible from phone

### Background service stops

**Solution**:
- Some phones aggressively kill background apps
- Go to phone Settings → Battery → Disable battery optimization for PixSim Agent

## Development

### Debug Mode

Run in Android Studio:
1. Connect phone via USB
2. Click green "Run" button (or Shift+F10)
3. Select your device
4. App installs and launches automatically

View logs:
```bash
adb logcat -s HeartbeatService MainActivity
```

### Release Build

Create signed APK for distribution:

1. Android Studio → Build → Generate Signed Bundle/APK
2. Create new keystore or use existing
3. Choose "APK" → "release" variant
4. APK at: `app/release/app-release.apk`

## Dependencies

- **AndroidX Core**: 1.12.0
- **Material Components**: 1.11.0
- **Kotlin Coroutines**: 1.7.3
- **JADB**: 1.2.1 (ADB library)

## License

Part of the PixSim automation platform.

## Support

Issues? Contact support or check backend logs for pairing errors.
