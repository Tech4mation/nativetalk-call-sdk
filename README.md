# @nativetalkcommunications/react-native-call-sdk

> Plug-and-play SIP / VoIP calling for React Native.
>
> Drop-in `<CallProvider>`, a `useCall()` hook, optional UI screens — and a
> native Android + iOS layer that handles backgrounding, foreground services,
> notifications, and CallKit/Push integration so you don't have to.

---

## Highlights

| Feature | Notes |
|---|---|
| **Plug-and-play** | One provider, one hook. No coupling to your auth, navigation, or HTTP client. |
| **Backgrounded calls** | Android foreground service keeps the registration warm. iOS supports VoIP push. |
| **Bundled UI** | Optional `<Dialer />`, `<IncomingCallView />`, `<OutgoingCallView />`. Use them or roll your own. |
| **Typed** | First-class TypeScript types throughout. |
| **No coupling** | No `useAuth`, no navigation lib, no axios. You inject everything. |

---

## Requirements

- React Native ≥ 0.73
- iOS ≥ 13.0
- Android `minSdkVersion` ≥ 24 (Android 7.0)
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

## Quick start

```tsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CallProvider, useCall } from '@nativetalkcommunications/react-native-call-sdk';
import { Dialer, IncomingCallView, OutgoingCallView } from '@nativetalkcommunications/react-native-call-sdk/ui';

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

function CallScreen({ onLogout }) {
  const { registration, callStatus } = useCall();
  const isRegistered = registration?.state === 'ok';

  // Show appropriate view based on call state
  if (callStatus === 'IncomingReceived') {
    return <IncomingCallView />;
  }

  if (['OutgoingInit', 'OutgoingProgress', 'OutgoingRinging', 'Connected', 'StreamsRunning'].includes(callStatus)) {
    return <OutgoingCallView />;
  }

  // Default: show dialer when idle
  return (
    <View style={styles.dialerContainer}>
      <SafeAreaView>
        <View style={styles.statusBar}>
          <TouchableOpacity onPress={onLogout} style={{ paddingRight: 12 }}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <View style={[styles.statusDot, isRegistered ? styles.statusConnected : styles.statusDisconnected]} />
          <Text style={styles.statusText}>
            {isRegistered ? 'Connected' : 'Connecting...'}
          </Text>
        </View>
      </SafeAreaView>
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
      <CallScreen onLogout={handleLogout} />
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
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusConnected: {
    backgroundColor: '#4CAF50',
  },
  statusDisconnected: {
    backgroundColor: '#FF9800',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    color: '#333',
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
  backText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2196F3',
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

## Documentation

| Topic | Where |
|---|---|
| **Android setup deep-dive** — services, channels, manifest, Maven repo | [docs/android-setup.md](docs/android-setup.md) |
| **iOS setup deep-dive** — CallKit, PushKit | [docs/ios-setup.md](docs/ios-setup.md) |
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
