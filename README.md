# @nativetalkcommunications/react-native-call-sdk

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
| **Cross-platform** | Android (Linphone SDK 5.x) and iOS (Linphone 5.x + CallKit-ready). |
| **Backgrounded calls** | Android foreground service keeps the registration warm. iOS supports VoIP push. |
| **Bundled UI** | Optional `<Dialer />`, `<IncomingCallView />`, `<OutgoingCallView />`. Use them or roll your own. |
| **Typed** | First-class TypeScript types throughout. |
| **No coupling** | No `useAuth`, no navigation lib, no axios. You inject everything. |

---

## Requirements

- React Native ≥ 0.73
- iOS ≥ 13.0
- Android `minSdkVersion` ≥ 24 (Android 7.0)
- Linphone SDK 5.4.x (Android pulled automatically via Maven; iOS xcframeworks downloaded automatically on first `pod install`)
- **React Native < 0.82:** set `newArchEnabled=false` in `android/gradle.properties`. React Native ≥ 0.82 runs New Architecture by default and the SDK works via the interop layer — the flag is not needed.

---

## Installation

```bash
npm install @nativetalkcommunications/react-native-call-sdk
# or
yarn add @nativetalkcommunications/react-native-call-sdk
```

---

## Expo setup

If your app uses Expo, the config plugin handles all native configuration automatically.

---

### Installing from npm

#### 1. Add the plugin to `app.json`

```json
{
  "expo": {
    "plugins": [
      "@nativetalkcommunications/react-native-call-sdk"
    ]
  }
}
```

#### 2. Run prebuild

```bash
npx expo prebuild
```

This automatically configures:
- **Android** — adds the Linphone Maven repository to `android/build.gradle`
- **iOS** — adds `NSMicrophoneUsageDescription` and `UIBackgroundModes` to `Info.plist`, and adds the `pod 'linphonesw'` line to the `Podfile`

Prebuild also runs `pod install` automatically. On the first run, the linphonesw pod downloads the Linphone xcframeworks (~90 seconds, one-time per machine). No SPM step, no manual setup.

---

### Installing from a local path (development only)

Use this when installing via `npm install file:../nativetalk-call-sdk` during SDK development.

#### 1. Add the plugin to `app.json`

```json
{
  "expo": {
    "plugins": [
      "@nativetalkcommunications/react-native-call-sdk"
    ]
  }
}
```

#### 2. Update `metro.config.js`

If your project does not have a `metro.config.js`, create one at the project root. If it already exists, merge the SDK entries into your existing config:

```js
const { getDefaultConfig } = require('expo/metro-config');
const { mergeConfig } = require('@react-native/metro-config');
const path = require('path');

const sdkPath = path.resolve(__dirname, '../nativetalk-call-sdk'); // adjust path as needed

const sdkConfig = {
  watchFolders: [sdkPath],
  resolver: {
    unstable_enableSymlinks: true,
    extraNodeModules: {
      '@nativetalkcommunications/react-native-call-sdk': sdkPath,
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-native': path.resolve(__dirname, 'node_modules/react-native'),
    },
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(sdkPath, 'node_modules'),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), sdkConfig);
```

#### 3. Remove duplicate react/react-native from the SDK

Check if duplicates exist and delete them:

```bash
ls ../nativetalk-call-sdk/node_modules | grep react   # check first
rm -rf ../nativetalk-call-sdk/node_modules/react
rm -rf ../nativetalk-call-sdk/node_modules/react-native
```

#### 4. Run prebuild

```bash
npx expo prebuild
```

Same as the npm install path — the plugin configures Android and iOS automatically.

---

### Plugin options

```json
{
  "expo": {
    "plugins": [
      ["@nativetalkcommunications/react-native-call-sdk", {
        "microphonePermission": "This app needs microphone access for voice calls."
      }]
    ]
  }
}
```

| Option | Default | Description |
|---|---|---|
| `microphonePermission` | `"Microphone access is required for calls."` | iOS microphone permission dialog text |

---

## React Native CLI setup

If you are **not** using Expo, follow the Android and iOS setup sections below manually.

### Local installs only — update Metro config

**Skip this step for published npm installs.** If installing from a local path (e.g. `"file:../nativetalk-call-sdk"`), merge the following into your `metro.config.js`. If you already have a `watchFolders`, `extraNodeModules`, or `nodeModulesPaths` config, add the SDK entries to your existing arrays/objects rather than replacing them.

```js
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

const sdkPath = path.resolve(__dirname, '../nativetalk-call-sdk'); // adjust path as needed

const sdkConfig = {
  watchFolders: [sdkPath],
  resolver: {
    unstable_enableSymlinks: true,
    extraNodeModules: {
      '@nativetalkcommunications/react-native-call-sdk': sdkPath,
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-native': path.resolve(__dirname, 'node_modules/react-native'),
    },
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(sdkPath, 'node_modules'),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), sdkConfig);
```

> **If your metro.config.js already calls `mergeConfig`**, pass `sdkConfig` as an additional argument: `mergeConfig(getDefaultConfig(__dirname), yourExistingConfig, sdkConfig)`.

### Local installs only — remove duplicate react/react-native

**Skip this step for published npm installs.** Check if duplicates exist and delete them:

```bash
ls ../nativetalk-call-sdk/node_modules | grep react   # check first
rm -rf ../nativetalk-call-sdk/node_modules/react
rm -rf ../nativetalk-call-sdk/node_modules/react-native
```

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
import { CallEngine } from '@nativetalkcommunications/react-native-call-sdk';
await CallEngine.requestMicPermission(); // Android only, no-op on iOS
```

### 5. Inbound calls — use a real device for testing

Inbound calls do not work on the Android emulator. The emulator is behind a nested NAT (`10.0.2.15` is not reachable from outside). The SIP server cannot route an INVITE back to the emulator's contact address, so the caller gets "number does not exist" and Linphone never sees the INVITE.

Outbound calls, registration, and all other features work fine on the emulator.

**Test inbound calls on a real Android device.**

---

## iOS setup

### 1. Declare linphonesw in your Podfile

The SDK bundles a self-contained `linphonesw-pod` inside the npm package. Add one line to your `ios/Podfile` inside the target block:

```ruby
target 'YourApp' do
  config = use_native_modules!

  pod 'linphonesw', :path => '../node_modules/@nativetalkcommunications/react-native-call-sdk/linphonesw-pod'

  # ... rest of Podfile
end
```

Then run:

```bash
cd ios && pod install
```

On the first install, the pod automatically downloads the Linphone xcframeworks (~90 seconds). This is a one-time operation — CocoaPods caches the result so subsequent installs are instant.

> **No SPM step required.** The old workflow of adding the Linphone Swift Package in Xcode is no longer needed.

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
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { CallProvider, useCall } from '@nativetalkcommunications/react-native-call-sdk';
import { Dialer } from '@nativetalkcommunications/react-native-call-sdk/ui';

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('100');
  const [password, setPassword] = useState('secret');
  const [domain, setDomain] = useState('pbx.example.com');
  const [transport, setTransport] = useState('tcp');

  const handleLogin = () => {
    if (!username || !password || !domain) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    onLogin({ username, password, domain, transport });
  };

  return (
    <View style={styles.loginContainer}>
      <Text style={styles.title}>SIP Credentials</Text>
      <TextInput
        style={styles.input}
        placeholder="Username"
        value={username}
        onChangeText={setUsername}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <TextInput
        style={styles.input}
        placeholder="Domain"
        value={domain}
        onChangeText={setDomain}
      />
      <TextInput
        style={styles.input}
        placeholder="Transport (tcp/udp)"
        value={transport}
        onChangeText={setTransport}
      />
      <TouchableOpacity style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>Login</Text>
      </TouchableOpacity>
    </View>
  );
}

function DialerWithSignout({ onLogout }) {
  const { isRegistered } = useCall();

  return (
    <View style={styles.dialerContainer}>
      {isRegistered && (
        <TouchableOpacity style={styles.signoutButton} onPress={onLogout}>
          <Text style={styles.signoutText}>Sign Out</Text>
        </TouchableOpacity>
      )}
      <Dialer />
    </View>
  );
}

export default function App() {
  const [config, setConfig] = useState(null);

  const handleLogin = (credentials) => {
    setConfig(credentials);
  };

  const handleLogout = () => {
    setConfig(null);
  };

  if (!config) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <CallProvider
      config={config}
      onIncomingCall={(info) => console.log('Incoming from', info.phone)}
      onRegistrationStateChanged={(r) => console.log('SIP:', r.state)}
      onError={(e) => Alert.alert('SDK Error', e.message)}
    >
      <DialerWithSignout onLogout={handleLogout} />
    </CallProvider>
  );
}

const styles = StyleSheet.create({
  loginContainer: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  dialerContainer: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  button: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  signoutButton: {
    backgroundColor: '#F44336',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    margin: 12,
  },
  signoutText: {
    color: '#fff',
    fontSize: 14,
  },
});
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
| `Could not find org.linphone:linphone-sdk-android` | Wrong or missing Maven repo | Add `download.linphone.org/maven_repository` to `android/build.gradle` in the `allprojects { repositories { } }` block |
| `PlatformConstants could not be found` | New Architecture enabled but SDK uses Old Arch | Set `newArchEnabled=false` in `gradle.properties`, uninstall APK, clean rebuild |
| `TurboModuleRegistry … was not found` | Duplicate react-native in SDK node_modules | Delete `nativetalk-call-sdk/node_modules/react` and `.../react-native` |
| `Unable to load script` | Metro not running after clean build | Start Metro separately (`npx react-native start`), then run the app |
| `No podspec found for linphonesw` | Podfile missing the `pod 'linphonesw'` line | Add `pod 'linphonesw', :path => '../node_modules/@nativetalkcommunications/react-native-call-sdk/linphonesw-pod'` to your Podfile |
| `'jni.h' file not found` | Linphone xcframeworks embedded directly in NativetalkCallSdk module | Ensure linphonesw is a separate pod — do not vendor the xcframeworks directly in NativetalkCallSdk |
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
import { CallProvider, useCall } from '@nativetalkcommunications/react-native-call-sdk';

// Types
import type {
  SipConfig, SipTransport,
  CallApi, CallState, CallLogEntry,
  IncomingCallInfo, RegistrationEvent, RegistrationState,
  DeclineReason,
  CallProviderProps, CallProviderEvents,
} from '@nativetalkcommunications/react-native-call-sdk';

// Helpers
import {
  formatDuration,        // 65 → "1:05"
  callStatusLabel,       // "StreamsRunning" → "In progress"
  parseSipUser,          // "sip:100@x" → "100"
  sanitizeDial,          // strips non-dial chars
  formatTenantDomain,    // strips http(s):// and trailing /
  destinationToSipUri,   // "100" + "sip.example.com" → "sip:100@sip.example.com"
} from '@nativetalkcommunications/react-native-call-sdk';

// Escape hatch: drive the native module directly (e.g. from headless tasks)
import { CallEngine } from '@nativetalkcommunications/react-native-call-sdk';

// Optional UI
import {
  Dialer,
  IncomingCallView,
  OutgoingCallView,
  Avatar,
  defaultTheme,
  mergeTheme,
  type CallTheme,
} from '@nativetalkcommunications/react-native-call-sdk/ui';
```

---

## License

MIT — see [LICENSE](LICENSE).
