# Installation

Complete install path. Most apps spend most of their time in the iOS section —
Android is largely autolinked.

## 1. Install the package

```bash
npm install @nativetalkcommunications/react-native-call-sdk
# or
yarn add @nativetalkcommunications/react-native-call-sdk
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

The SDK depends on `linphonesw`, the Swift binding for Linphone. That pod is
**bundled inside the npm package** at `linphonesw-pod/`, and it downloads the
Linphone xcframeworks (5.4.117) itself on first install. It is not in any public
spec repo, so CocoaPods cannot find it unless your `Podfile` says where it is.
Add this line to your `Podfile`, inside your app's `target` block:

```ruby
pod 'linphonesw', :path => '../node_modules/@nativetalkcommunications/react-native-call-sdk/linphonesw-pod'
```

Then:

```bash
cd ios && pod install
```

The first install downloads about 15 frameworks and takes a few minutes.
CocoaPods caches them, so later installs are quick.

**Expo users get this line automatically** from the config plugin — add
`@nativetalkcommunications/react-native-call-sdk` to the `plugins` array in
`app.json` and run `npx expo prebuild`. Bare React Native apps must add it by
hand. Without it `pod install` fails with:

```
[!] Unable to find a specification for `linphonesw` depended upon by `NativetalkCallSdk`
```

Nothing has to be dragged into Xcode, and there is no Linphone release to
download by hand. If you have followed an older version of these docs and added
`.xcframework`s to your project manually, remove them — two copies of Linphone
in one target will not link.

One build setting matters: **Build Libraries for Distribution** must be `NO` on
your app target, or Swift name mangling breaks and the app crashes on launch
with `_swift_*` symbol errors.

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

### CallKit + VoIP push

Not optional if calls have to arrive while the app is in the background, which
on iOS is almost always. Without it the phone suspends the app, the SIP socket
closes, and the call is offered to nobody.

Wiring CallKit and PushKit is host-app territory because the call UI must
appear before React Native is ready. See [push-notifications.md](push-notifications.md)
for a copy-paste-ready `AppDelegate.swift` template that integrates with the
SDK via `CallEngine.registerVoipToken(hex)`.

If your app is published from your own Apple Developer account rather than
Nativetalk's, read [voip-push-setup.md](voip-push-setup.md) too. Apple will
only accept a push for your app from the account that owns it, so there is a
key you have to create and upload before any of this can work.

## 4. Verify

In your `App.tsx`:

```tsx
import { CallProvider } from '@nativetalkcommunications/react-native-call-sdk';

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
