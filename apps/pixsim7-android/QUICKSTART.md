# Quick Start Guide

## Before Building

### 1. Update Backend URL

Edit these two files and replace `https://api.pixsim.com` with your actual backend URL:

1. `app/src/main/java/com/pixsim/agent/MainActivity.kt` (line ~15)
2. `app/src/main/java/com/pixsim/agent/HeartbeatService.kt` (line ~20)

### 2. Install Android Studio (if not installed)

Download from: https://developer.android.com/studio

## Build Options

### Option A: Android Studio (Easiest)

```
1. Open Android Studio
2. File → Open → Select "pixsim-agent-android" folder
3. Wait for Gradle sync (2-5 minutes)
4. Build → Build Bundle(s) / APK(s) → Build APK(s)
5. Find APK at: app/build/outputs/apk/debug/app-debug.apk
```

### Option B: Command Line

Windows:
```bat
cd pixsim-agent-android
gradlew.bat assembleDebug
```

Linux/Mac:
```bash
cd pixsim-agent-android
chmod +x gradlew
./gradlew assembleDebug
```

APK will be at: `app/build/outputs/apk/debug/app-debug.apk`

## Install on Phone

### Via USB (Recommended)

1. Enable USB Debugging on phone:
   - Settings → About Phone → Tap "Build Number" 7 times
   - Settings → Developer Options → Enable "USB Debugging"

2. Connect phone via USB

3. Install:
```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

### Via File Transfer

1. Copy `app-debug.apk` to phone
2. Open file and tap "Install"
3. Allow "Install from unknown sources" if prompted

## Usage

1. Open "PixSim Agent" app on phone
2. Tap "Connect to PixSim"
3. Copy the pairing code (e.g., "A1B2-C3D4")
4. Go to your PixSim web app
5. Enter the code in automation settings
6. Wait for "Connected successfully!"

Done! The app now runs in background.

## Troubleshooting

**Build fails?**
- Check Android Studio SDK Manager has Android SDK 34 installed

**Can't find adb?**
- Windows: Add to PATH: `C:\Users\YourName\AppData\Local\Android\Sdk\platform-tools`
- Mac: Add to PATH: `~/Library/Android/sdk/platform-tools`
- Linux: Add to PATH: `~/Android/Sdk/platform-tools`

**Connection fails?**
- Verify backend URL is correct
- Check phone has internet connection
- Make sure backend is accessible from phone's network

## Next Steps

See full README.md for:
- Project structure
- Development guide
- Release build instructions
- Advanced troubleshooting
