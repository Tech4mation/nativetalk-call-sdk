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

## Installation

```bash
npm install @nativetalk/react-native-call-sdk
# or
yarn add @nativetalk/react-native-call-sdk
```

### Android

1. The SDK autolinks. No `MainApplication` edits needed.
2. Add `RECORD_AUDIO` permission handling at runtime (the SDK can do this for you — see [docs/permissions.md](docs/permissions.md)).
3. The Linphone Android SDK (`org.linphone:linphone-sdk-android:5.4.44`) is pulled in transitively.

### iOS

1. Run `cd ios && pod install`.
2. Add the Linphone iOS framework to your Xcode project. See [docs/ios-setup.md](docs/ios-setup.md) — this is the only step that needs manual work because Linphone is not on CocoaPods.
3. For incoming calls when the app is killed/backgrounded, wire up CallKit + PushKit in your `AppDelegate`. A copy-pasteable template is in [docs/push-notifications.md](docs/push-notifications.md).

Full setup: **[docs/installation.md](docs/installation.md)**.

---

## Quick start

```tsx
import React from 'react';
import {
  CallProvider,
  useCall,
} from '@nativetalk/react-native-call-sdk';
import { Dialer } from '@nativetalk/react-native-call-sdk/ui';

const sip = {
  username: '100',
  password: 'secret',
  domain: 'sip.example.com',
  transport: 'tcp',
};

export default function App() {
  return (
    <CallProvider
      config={sip}
      onIncomingCall={(info) => {
        // navigation.navigate('IncomingCall', info)
        console.log('Incoming from', info.phone);
      }}
      onRegistrationStateChanged={(r) => console.log('SIP:', r.state)}
    >
      <Dialer />
    </CallProvider>
  );
}
```

That's a working softphone. The hook gives you everything else:

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
| **Installation** (Android & iOS, autolinking, Linphone framework) | [docs/installation.md](docs/installation.md) |
| **Quick start** & full sample app | [docs/quickstart.md](docs/quickstart.md) |
| **Configuration** — every prop on `<CallProvider>` | [docs/configuration.md](docs/configuration.md) |
| **API reference** — every export, every type | [docs/api-reference.md](docs/api-reference.md) |
| **Bundled UI components** — props, theming, customization | [docs/ui-components.md](docs/ui-components.md) |
| **Android setup deep-dive** — services, channels, manifest | [docs/android-setup.md](docs/android-setup.md) |
| **iOS setup deep-dive** — CallKit, PushKit, Linphone framework | [docs/ios-setup.md](docs/ios-setup.md) |
| **Push notifications** — VoIP push wakeup, FCM data messages | [docs/push-notifications.md](docs/push-notifications.md) |
| **Permissions** — what to ask for and when | [docs/permissions.md](docs/permissions.md) |
| **Architecture** — what's in the box and why | [docs/architecture.md](docs/architecture.md) |
| **Troubleshooting** — common errors and fixes | [docs/troubleshooting.md](docs/troubleshooting.md) |

---

## API surface

The full surface in one block (TypeScript):

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

## Requirements

- React Native ≥ 0.70
- iOS ≥ 13.0
- Android `minSdkVersion` ≥ 24 (Android 7.0)
- Linphone SDK 5.4.44 (Android pulled automatically; iOS framework dropped into the project)

---

## License

MIT — see [LICENSE](LICENSE).
