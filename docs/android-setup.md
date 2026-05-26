# Android setup deep-dive

The SDK is autolinked, so most apps need nothing more than the steps in
[installation.md](installation.md). This page documents what the SDK adds to
your Android build and how to customise it.

## What the SDK contributes

### Manifest entries

Merged into your final `AndroidManifest.xml` via manifest merging:

```xml
<!-- Foreground service that owns the call notification -->
<service
    android:name="io.nativetalk.callsdk.CallService"
    android:foregroundServiceType="phoneCall|microphone" />

<!-- Long-running service that keeps the SIP registration warm -->
<service
    android:name="io.nativetalk.callsdk.BackgroundService"
    android:foregroundServiceType="phoneCall" />

<!-- Optional: device call-screening (opt-in, see below) -->
<service
    android:name="io.nativetalk.callsdk.NativetalkCallScreeningService"
    android:permission="android.permission.BIND_SCREENING_SERVICE" />

<!-- Receives Answer/Decline taps on the heads-up call notification -->
<receiver android:name="io.nativetalk.callsdk.CallActionReceiver" />
```

### Permissions

| Permission | Required? | What it's for |
|---|---|---|
| `INTERNET`, `ACCESS_NETWORK_STATE`, `WAKE_LOCK` | yes | Basic SIP signalling. |
| `RECORD_AUDIO` | yes | Audio capture. **Runtime permission.** |
| `MODIFY_AUDIO_SETTINGS`, `BLUETOOTH` | yes | Audio routing + BT headsets. |
| `MANAGE_OWN_CALLS`, `CALL_PHONE` | yes | Telecom framework integration. |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, `FOREGROUND_SERVICE_PHONE_CALL` | yes (Android 14+) | Foreground service types. |
| `POST_NOTIFICATIONS` | yes (Android 13+) | Show call heads-up. **Runtime permission.** |
| `USE_FULL_SCREEN_INTENT` | yes | Full-screen incoming call notification. |
| `READ_CONTACTS` | optional | Contact lookups for caller-ID. |
| `READ_PHONE_STATE` | optional | Listen for native GSM call state (TelephonyMonitor). |
| `BIND_SCREENING_SERVICE` | optional | Required if you opt into call-screening. |

The SDK manifest declares all of these. You don't need to copy them. To
*remove* one you don't want (e.g. you're never going to ask for contacts),
use the manifest-merge `remove` rule in your app manifest:

```xml
<uses-permission android:name="android.permission.READ_CONTACTS"
                 tools:node="remove" />
```

### Resources

The SDK adds:

- `R.drawable.ic_nativetalk_call` — the small icon used in call notifications.
- A few strings under `R.string.nativetalk_call_sdk_*` for channel names.

These won't collide with your app's resources because they're SDK-namespaced.

### Dependencies pulled in

- `org.linphone:linphone-sdk-android:5.4.44` (the SIP/VoIP engine)
- `androidx.core:core-ktx`
- `androidx.appcompat:appcompat`

## Custom notification icon

The default `ic_nativetalk_call` is a plain phone glyph. To override, add
your own drawable with the same name in your app's resources — Android
manifest merge resolves duplicates by giving the host app priority.

```
android/app/src/main/res/drawable/ic_nativetalk_call.xml
```

## Background service tuning

By default the SDK starts both `BackgroundService` (long-running registration
keeper) and `CallService` (foreground service for active calls).

To disable the background keeper entirely:

```tsx
<CallProvider enableNativeServices={false} config={…}>
  …
</CallProvider>
```

The SDK will still handle live calls, but you must trigger `register()`
yourself when push wakes the app.

## Auto-start on boot

Not enabled by default. If your product calls for it, add a `BroadcastReceiver`
in your app that listens for `BOOT_COMPLETED` and calls
`startNativeServices()` once React has booted.

## ProGuard / R8

Add to `proguard-rules.pro`:

```pro
-keep class org.linphone.** { *; }
-keep class io.nativetalk.callsdk.** { *; }
```

If your build strips field accessors from Linphone, you may see
`NoSuchMethodError`s at runtime.

## Battery-optimisation whitelist

Aggressive Android OEMs (Xiaomi, Huawei, OnePlus) kill background services
liberally. If your users report missed calls, surface the OEM's
"don't optimise" dialog using a library like
[react-native-disable-battery-optimizations-android](https://github.com/ChAlexInc/react-native-disable-battery-optimizations-android).

## Telecom & ConnectionService

The SDK uses the manifest entries for Telecom framework integration but
does **not** ship a full `ConnectionService` implementation. Most apps don't
need one — `MANAGE_OWN_CALLS` is enough to coexist nicely with native phone
calls. If you have advanced requirements (call holding alongside GSM, native
in-call screen), see the architecture notes in
[architecture.md](architecture.md).
