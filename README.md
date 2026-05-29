# @nativetalk/react-native-call-sdk

> Plug-and-play SIP / VoIP calling for React Native, powered by [Linphone](https://www.linphone.org/).
>
> Drop-in `<CallProvider>`, a `useCall()` hook, optional UI screens — and a
> native Android + iOS layer that handles backgrounding, foreground services,
> notifications, and CallKit/Push integration so you don't have to.

---

## Highlights

| Feature | Notes |
|---|---|
| **Plug-and-play** | One provider, one hook. No coupling to your auth, navigation, or HTTP client. |
| **Cross-platform** | Android (Linphone SDK 5.x) and iOS (linphonesw + CallKit-ready). |
| **Backgrounded calls** | Android foreground service keeps the registration warm. iOS supports VoIP push. |
| **Bundled UI** | Optional `<Dialer />`, `<IncomingCallView />`, `<OutgoingCallView />`. Use them or roll your own. |
| **Typed** | First-class TypeScript types throughout. |
| **No coupling** | No `useAuth`, no navigation lib, no axios. You inject everything. |

---

## Requirements

- React Native ≥ 0.73
- iOS ≥ 13.0
- Android `minSdkVersion` ≥ 24 (Android 7.0)
- Linphone SDK 5.4.x (Android pulled automatically via Maven; iOS via Swift Package Manager)
- **New Architecture must be disabled on Android** — set `newArchEnabled=false` in `android/gradle.properties`. TurboModules support is planned.

---

## Installation

```bash
npm install @nativetalk/react-native-call-sdk
# or
yarn add @nativetalk/react-native-call-sdk
```

### Local / file: installs (development only)

If you are installing from a local path (e.g. `"file:../nativetalk-call-sdk"`) during SDK development, do these two steps **before** running the app — skip them for published npm installs.

#### 1. Update Metro config

Metro does not watch outside the project root by default. Merge the following into your existing `metro.config.js`. If you already have a `watchFolders`, `extraNodeModules`, or `nodeModulesPaths` config, add the SDK entries to your existing arrays/objects rather than replacing them.

```js
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

const sdkPath = path.resolve(__dirname, '../nativetalk-call-sdk'); // adjust path as needed

const sdkConfig = {
  watchFolders: [sdkPath],
  resolver: {
    unstable_enableSymlinks: true,
    extraNodeModules: {
      '@nativetalk/react-native-call-sdk': sdkPath,
      // Force the host app's react + react-native to be used.
      // Without this, Metro finds the SDK's own node_modules/react-native
      // which has no native bridge — crashing with TurboModuleRegistry errors.
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-native': path.resolve(__dirname, 'node_modules/react-native'),
    },
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(sdkPath, 'node_modules'),
    ],
  },
};

// mergeConfig deep-merges arrays and objects, so existing config is preserved.
module.exports = mergeConfig(getDefaultConfig(__dirname), sdkConfig);
```

> **If your metro.config.js already calls `mergeConfig`**, pass `sdkConfig` as an additional argument or merge it yourself — `mergeConfig` accepts multiple config objects: `mergeConfig(getDefaultConfig(__dirname), yourExistingConfig, sdkConfig)`.

#### 2. Remove duplicate react/react-native from the SDK's node_modules

The SDK has `react` and `react-native` as `devDependencies` so it can be built and type-checked in isolation during SDK development. This means if the SDK developer ran `npm install` inside the SDK directory, `nativetalk-call-sdk/node_modules/react` and `.../react-native` will exist on disk.

When you do a local file install, Metro finds those copies first and uses them instead of your app's copies — breaking the native bridge with:

```
TurboModuleRegistry … was not found
```

> **This only happens with local file installs.** When the SDK is installed from npm, devDependencies are not included and this problem does not occur.

Check if they exist and delete them if so:

```bash
ls ../nativetalk-call-sdk/node_modules | grep react   # check first
rm -rf ../nativetalk-call-sdk/node_modules/react
rm -rf ../nativetalk-call-sdk/node_modules/react-native
```

The `extraNodeModules` config above forces all `react`/`react-native` imports to resolve to the host app's copy regardless, but deleting the duplicates avoids the issue entirely.

---

## Android setup

### 1. Add the Linphone Maven repository

The Linphone SDK is not published to Maven Central. You need to add their repository to `android/settings.gradle`.

**If your `settings.gradle` already has a `dependencyResolutionManagement` block**, add the Linphone `maven { }` entry inside the existing `repositories { }` block.

**If your `settings.gradle` does not have a `dependencyResolutionManagement` block** (common in fresh RN 0.73+ projects), add the entire block at the bottom of the file:

```groovy
// android/settings.gradle — add at the bottom
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)
    repositories {
        google()
        mavenCentral()
        maven { url "https://www.jitpack.io" }
        maven {
            name = "linphone.org maven repository"
            url = uri("https://download.linphone.org/maven_repository")
            content {
                includeGroup("org.linphone")
            }
        }
    }
}
```

> **Important:** `repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)` means only repositories listed in this block are used — adding repos elsewhere (e.g. `android/build.gradle`) will be silently ignored. Make sure `google()` and `mavenCentral()` are included here too.

Without the Linphone repo your build will fail with:
```
Could not find org.linphone:linphone-sdk-android:5.4.x.
```

> **Wrong URL**: The older Linphone URL (`linphone.org/maven/repository`) is dead. Use `download.linphone.org/maven_repository` as shown above.

### 2. Disable New Architecture

The SDK uses the Old Architecture (NativeModules/NativeEventEmitter) bridge. Open `android/gradle.properties` and set:

```properties
newArchEnabled=false
```

If you previously had this set to `true`, you must do a clean reinstall:

```bash
# Uninstall the old APK from the device first
adb uninstall com.yourapp

# Then full clean rebuild
cd android && ./gradlew clean && cd ..
npx react-native run-android
```

Without the clean uninstall, the old New Architecture binary might remain on-device and could crash with:
```
PlatformConstants could not be found. Verify that it is available as a TurboModule.
```

### 3. Autolink

No `MainApplication` edits needed — the SDK autolinks.

### 4. Runtime permissions

`RECORD_AUDIO` must be granted before the first call. The provider handles this automatically when `requestMicPermission={true}` (the default). To request it manually:

```ts
import { CallEngine } from '@nativetalk/react-native-call-sdk';
await CallEngine.requestMicPermission(); // Android only, no-op on iOS
```

### 5. Inbound calls — use a real device for testing

Inbound calls do not work on the Android emulator. The emulator is behind a nested NAT (`10.0.2.15` is not reachable from outside). The SIP server cannot route an INVITE back to the emulator's contact address, so the caller gets "number does not exist" and Linphone never sees the INVITE.

Outbound calls, registration, and all other features work fine on the emulator.

**Test inbound calls on a real Android device.**

---

## iOS setup

### 1. Get the Linphone xcframeworks on disk

Linphone for iOS is **not on CocoaPods**. CocoaPods needs the xcframeworks to already exist on disk — it does not download them itself.

**If this machine has never had a Linphone iOS project before**, add the Swift Package temporarily to trigger the download, then remove it:

```
https://gitlab.linphone.org/BC/public/linphone-sdk-swift-ios.git
```

1. Open your app's `.xcworkspace`
2. **File → Add Package Dependencies…**
3. Paste the URL above, version rule **Up to Next Major Version** from `5.4.0`
4. Click **Add Package** — this downloads the xcframeworks to DerivedData

**Then remove it immediately** — leaving it in alongside the CocoaPods linphonesw pod causes `Multiple commands produce '…linphone.framework'`:

5. Root project (blue icon) → **PROJECT** → **Package Dependencies** tab → select `linphone-sdk-swift-ios` → **−**
6. Target → **General** → **Frameworks, Libraries, and Embedded Content** → remove `linphonesw` if present

**If the xcframeworks are already on disk** (e.g. another Linphone project was previously opened on this machine), skip the SPM step entirely — just proceed to the linphonesw-pod setup below.

### 2. Declare linphonesw in your Podfile

The SDK's pod (`NativetalkCallSdk`) depends on `linphonesw`. You must tell CocoaPods where to find it. Add to your `ios/Podfile`:

```ruby
target 'YourApp' do
  config = use_native_modules!
  # ... other pods ...

  pod 'linphonesw', :path => '../path/to/linphonesw-pod'
end
```

> **Setting up linphonesw-pod:** Create a `linphonesw-pod/` directory with a `linphonesw.podspec` that wraps the xcframeworks downloaded in step 1. See [docs/ios-setup.md](docs/ios-setup.md) for the exact steps.

Then run:

```bash
cd ios && pod install
```

### 3. Info.plist

Add to `ios/YourApp/Info.plist`:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Microphone access is required for calls.</string>

<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
  <string>voip</string>
</array>
```

Without `NSMicrophoneUsageDescription` your app will crash when Linphone requests the mic. Without `UIBackgroundModes`, iOS will kill the SIP connection when your app is backgrounded.

### 4. Xcode capabilities

In Xcode → your target → **Signing & Capabilities**:

- Add **Background Modes** → tick **Audio, AirPlay and Picture in Picture** and **Voice over IP**

This mirrors the `UIBackgroundModes` in Info.plist — both are required.

### 5. Simulator vs real device

Registration and foreground calls work on the iOS Simulator. What does **not** work on the simulator is PushKit — VoIP push tokens are never delivered to simulators, so background/killed-app inbound calls won't work there. For testing push-driven inbound calls, use a real iPhone.

### 6. CallKit + VoIP push (for background/killed-app incoming calls)

Without VoIP push, inbound calls only arrive when the SIP socket is already open (app foregrounded). For reliable incoming calls when the app is backgrounded or killed, you need CallKit + PushKit. See [docs/push-notifications.md](docs/push-notifications.md) for the copy-pasteable AppDelegate template.

---

## Quick start

```tsx
import React, { useState } from 'react';
import { Alert } from 'react-native';
import { CallProvider, useCall } from '@nativetalk/react-native-call-sdk';
import { Dialer } from '@nativetalk/react-native-call-sdk/ui';

const sip = {
  username: '100',
  password: 'secret',
  domain: 'yourcompany.nativetalk.io', // must be a *.nativetalk.io domain
  transport: 'tcp',
};

export default function App() {
  return (
    <CallProvider
      config={sip}
      onIncomingCall={(info) => console.log('Incoming from', info.phone)}
      onRegistrationStateChanged={(r) => console.log('SIP:', r.state)}
      onError={(e) => Alert.alert('SDK Error', e.message)}
    >
      <Dialer />
    </CallProvider>
  );
}
```

**Error handling** — all SDK errors are surfaced through `onError`. The callback receives `{ code: string, message: string }`. Common codes:

| Code | When |
|---|---|
| `INVALID_DOMAIN` | The SIP domain is not a `*.nativetalk.io` domain |
| `REGISTRATION_FAILED` | SIP server rejected the REGISTER request |
| `NO_CONFIG` | `register()` was called with no config available |
| `DIAL_FAILED` | `dial()` was called with no domain configured |

The hook gives you everything else:

```tsx
function CallControls() {
  const {
    callStatus,
    formattedDuration,
    isMuted, isSpeaker, isHeld,
    dial, answer, hangup, decline,
    toggleMute, toggleSpeaker, toggleHold,
    sendDtmf,
  } = useCall();

  return (
    <View>
      <Text>{callStatus} — {formattedDuration}</Text>
      <Button onPress={() => dial('+2348012345678')} title="Dial" />
      <Button onPress={hangup} title="Hang up" />
    </View>
  );
}
```

---

## Common errors

| Error | Cause | Fix |
|---|---|---|
| `Could not find org.linphone:linphone-sdk-android` | Wrong or missing Maven repo | Add `download.linphone.org/maven_repository` to `settings.gradle` inside `dependencyResolutionManagement` |
| `PlatformConstants could not be found` | New Architecture enabled but SDK uses Old Arch | Set `newArchEnabled=false` in `gradle.properties`, uninstall APK, clean rebuild |
| `TurboModuleRegistry … was not found` | Duplicate react-native in SDK node_modules | Delete `nativetalk-call-sdk/node_modules/react` and `.../react-native` |
| `Unable to load script` | Metro not running after clean build | Start Metro separately (`npx react-native start`), then run the app |
| `import linphonesw` build error on iOS | Linphone SPM package not added to Xcode | Add `linphone-sdk-swift-ios` via File → Add Package Dependencies to download the xcframeworks, then remove it from the project |
| `Multiple commands produce '…linphone.framework'` | SPM package still in project alongside the linphonesw pod | Remove `linphone-sdk-swift-ios` from Project → Package Dependencies, and remove `linphonesw` from target → Frameworks, Libraries, and Embedded Content |
| `No podspec found for linphonesw` | Podfile missing the `pod 'linphonesw'` line | Add the linphonesw pod entry to your Podfile and re-run `pod install` |
| Inbound calls not received (Android emulator) | Emulator NAT — SIP server can't reach `10.0.2.15` | Test on a real Android device |
| Inbound calls not received (iOS) | App backgrounded without VoIP push | Wire up CallKit + PushKit; see `docs/push-notifications.md` |

---

## Documentation

| Topic | Where |
|---|---|
| **Android setup deep-dive** — services, channels, manifest, Maven repo | [docs/android-setup.md](docs/android-setup.md) |
| **iOS setup deep-dive** — Linphone SPM, CallKit, PushKit | [docs/ios-setup.md](docs/ios-setup.md) |
| **Configuration** — every prop on `<CallProvider>` | [docs/configuration.md](docs/configuration.md) |
| **API reference** — every export, every type | [docs/api-reference.md](docs/api-reference.md) |
| **Bundled UI components** — props, theming, customization | [docs/ui-components.md](docs/ui-components.md) |
| **Push notifications** — VoIP push wakeup, FCM data messages | [docs/push-notifications.md](docs/push-notifications.md) |
| **Architecture** — what's in the box and why | [docs/architecture.md](docs/architecture.md) |
| **Troubleshooting** — common errors and fixes | [docs/troubleshooting.md](docs/troubleshooting.md) |

---

## API surface

```ts
// Main provider + hook
import { CallProvider, useCall } from '@nativetalk/react-native-call-sdk';

// Types
import type {
  SipConfig, SipTransport,
  CallApi, CallState, CallLogEntry,
  IncomingCallInfo, RegistrationEvent, RegistrationState,
  DeclineReason,
  CallProviderProps, CallProviderEvents,
} from '@nativetalk/react-native-call-sdk';

// Helpers
import {
  formatDuration,        // 65 → "1:05"
  callStatusLabel,       // "StreamsRunning" → "In progress"
  parseSipUser,          // "sip:100@x" → "100"
  sanitizeDial,          // strips non-dial chars
  formatTenantDomain,    // strips http(s):// and trailing /
  destinationToSipUri,   // "100" + "sip.example.com" → "sip:100@sip.example.com"
} from '@nativetalk/react-native-call-sdk';

// Escape hatch: drive the native module directly (e.g. from headless tasks)
import { CallEngine } from '@nativetalk/react-native-call-sdk';

// Optional UI
import {
  Dialer,
  IncomingCallView,
  OutgoingCallView,
  Avatar,
  defaultTheme,
  mergeTheme,
  type CallTheme,
} from '@nativetalk/react-native-call-sdk/ui';
```

---

## License

MIT — see [LICENSE](LICENSE).
