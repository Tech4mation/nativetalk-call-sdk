# Installation

Complete install path. Most apps spend most of their time in the iOS section —
Android is largely autolinked.

## 1. Install the package

```bash
npm install @nativetalk/react-native-call-sdk
# or
yarn add @nativetalk/react-native-call-sdk
```

## 2. Android

### Autolinking

React Native 0.71+ autolinks the SDK. **No `MainApplication` changes required.**

If you're on older RN (rare), add the package manually:

```kotlin
// MainApplication.kt
import io.nativetalk.callsdk.NativetalkCallSdkPackage

override fun getPackages(): List<ReactPackage> {
    val packages = PackageList(this).packages
    packages.add(NativetalkCallSdkPackage())  // only if not autolinked
    return packages
}
```

### Minimum SDK

In `android/build.gradle`:

```gradle
ext {
    minSdkVersion = 24       // Android 7.0
    compileSdkVersion = 34   // Android 14
    targetSdkVersion = 34
}
```

### Permissions

The SDK declares everything it needs in its own manifest — they're merged into
your app automatically. The full list and what each one is for is in
[permissions.md](permissions.md).

`RECORD_AUDIO` and `POST_NOTIFICATIONS` are **runtime** permissions — the SDK
can prompt for `RECORD_AUDIO` for you (see `requestMicPermission` prop on
`<CallProvider>`). For `POST_NOTIFICATIONS`, request it before starting native
services on Android 13+.

### ProGuard / R8

The SDK is annotation-friendly out of the box. If you've stripped a lot of
React Native rules from your `proguard-rules.pro`, add:

```pro
-keep class org.linphone.** { *; }
-keep class io.nativetalk.callsdk.** { *; }
```

## 3. iOS

### CocoaPods

```bash
cd ios && pod install
```

### Linphone framework — manual step

The iOS Swift binding for Linphone (`linphonesw`) is not on CocoaPods, so it
must be added to your Xcode project manually. **Once.**

1. Download the latest stable Linphone SDK release for iOS from
   <https://gitlab.linphone.org/BC/public/linphone-sdk/-/releases>
   (look for the iOS `.zip`).
2. Unzip and drag `linphone-sdk/apple-darwin/Frameworks/` into your Xcode
   project. Tick **"Copy items if needed"** and **"Add to target: <YourApp>"**.
3. In your Xcode target's *General* tab, scroll to **"Frameworks, Libraries,
   and Embedded Content"** and ensure each `.xcframework` is set to
   **"Embed & Sign"**.
4. In *Build Settings* set **"Always Embed Swift Standard Libraries"** to
   `YES`.

That's it — the SDK's Swift bridge can now `import linphonesw`.

> ⚠️ **The SDK podspec does not pull Linphone**. Doing so would force every
> consumer onto a specific framework distribution. By keeping it host-managed,
> you can swap Linphone versions independently.

### Minimum iOS

`Podfile`:

```ruby
platform :ios, '13.0'
```

### Capabilities & Info.plist

In your target's *Signing & Capabilities*, add:

- **Background Modes** → tick **Voice over IP**, **Audio, AirPlay, and Picture-in-Picture**, and (if you'll use VoIP push) **Remote notifications**.
- **Push Notifications** (only if you use VoIP push).

In `Info.plist`:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>To make and receive calls</string>
```

### Optional: CallKit + VoIP push

Wiring CallKit and PushKit is host-app territory because the call UI must
appear before React Native is ready. See [push-notifications.md](push-notifications.md)
for a copy-paste-ready `AppDelegate.swift` template that integrates with the
SDK via `CallEngine.registerVoipToken(hex)`.

## 4. Verify

In your `App.tsx`:

```tsx
import { CallProvider } from '@nativetalk/react-native-call-sdk';

export default function App() {
  return (
    <CallProvider
      config={{ username: '…', password: '…', domain: '…' }}
      onRegistrationStateChanged={(r) => console.log('Reg:', r.state)}
    >
      {/* your app */}
    </CallProvider>
  );
}
```

You should see registration progress in logs within a few seconds:

```
Reg: progress
Reg: ok
```

If you see `failed` instead, jump to [troubleshooting.md](troubleshooting.md).
