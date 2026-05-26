# Permissions

Quick reference for what the SDK needs.

## Android — runtime permissions

| Permission | When to ask | Who asks |
|---|---|---|
| `RECORD_AUDIO` | App first opens, or before the first call | SDK if `requestMicPermission={true}` (default), otherwise you |
| `POST_NOTIFICATIONS` | Android 13+, before starting services | You |
| `READ_CONTACTS` (optional) | Before showing caller-ID contact lookups | You |
| `READ_PHONE_STATE` (optional) | If you want native GSM call observation | You |

The SDK calls `PermissionsAndroid.request(RECORD_AUDIO)` on provider mount
unless you opt out:

```tsx
<CallProvider config={cfg} requestMicPermission={false}>
  …
</CallProvider>
```

### Asking for POST_NOTIFICATIONS (Android 13+)

```ts
import { PermissionsAndroid, Platform } from 'react-native';

async function ensureNotifPerm() {
  if (Platform.OS !== 'android') return true;
  if (Platform.Version < 33) return true;
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}
```

If `POST_NOTIFICATIONS` is denied:
- Outgoing calls still work (no notification needed).
- Incoming calls **work** but won't display a heads-up while the app is
  backgrounded. The SDK still emits the `CallIncoming` event.

### Manifest permissions (no runtime prompt)

The SDK declares these in its own manifest — you don't need to copy them:

```
INTERNET, ACCESS_NETWORK_STATE, WAKE_LOCK, RECEIVE_BOOT_COMPLETED, VIBRATE,
MODIFY_AUDIO_SETTINGS, BLUETOOTH, MANAGE_OWN_CALLS, CALL_PHONE,
FOREGROUND_SERVICE, FOREGROUND_SERVICE_MICROPHONE, FOREGROUND_SERVICE_PHONE_CALL,
USE_FULL_SCREEN_INTENT
```

To remove one you don't want, use `tools:node="remove"` in your app
manifest:

```xml
<uses-permission android:name="android.permission.READ_CONTACTS"
                 tools:node="remove" />
```

## iOS — Info.plist usage strings

```xml
<key>NSMicrophoneUsageDescription</key>
<string>To make and receive calls</string>
```

For VoIP push, you also need (in *Signing & Capabilities*):
- **Push Notifications** entitlement
- **Background Modes** → Voice over IP, Audio, Remote Notifications

## Handling denials gracefully

The SDK fires `onError({ code: 'MIC_PERMISSION_DENIED' })` if it asks for
the mic and the user refuses. A sensible UX is to:

1. Show an explainer screen.
2. Provide a "Open Settings" button using `Linking.openSettings()`.
3. Treat the call buttons as disabled until permission is granted.

```tsx
<CallProvider
  config={cfg}
  onError={(e) => {
    if (e.code === 'MIC_PERMISSION_DENIED') {
      setMicDenied(true);
    }
  }}
>
  {micDenied && <PermissionExplainer />}
  …
</CallProvider>
```
