# Troubleshooting

A list of failure modes and fixes, sorted by frequency.

## Build fails

### Android — `Duplicate class org.linphone.…`

You already have Linphone as a dependency elsewhere (e.g. an old fork or a
custom Linphone build). The SDK pulls `org.linphone:linphone-sdk-android:5.4.44`.
Either remove the other dependency or exclude one of them in
`android/app/build.gradle`:

```gradle
configurations.all {
    resolutionStrategy {
        force "org.linphone:linphone-sdk-android:5.4.44"
    }
}
```

### Android — `compileSdk too low`

Set `compileSdkVersion 34` (or higher) in `android/build.gradle`:

```gradle
ext { compileSdkVersion = 34 }
```

### iOS — `No such module 'linphonesw'`

You haven't added the Linphone iOS framework to your Xcode project. See
[ios-setup.md](ios-setup.md) → step 2.

### iOS — crashes mentioning `_swift_*` symbols

`Build Libraries for Distribution` is set to `YES`. Set it to `NO` in your
target's Build Settings. (This is a Linphone constraint, not an SDK one.)

### iOS — `Symbol not found: _OBJC_CLASS_$_NativetalkCallSdk`

Your target didn't include the SDK's Swift module. After `pod install`,
clean the build folder (`Cmd+Shift+K`) and rebuild.

## Runtime — registration

### `state: failed`, message empty

Almost always credentials. Check:
- `username` and `password` match what the PBX expects (case-sensitive).
- `domain` is the SIP server, **not** an HTTP URL. Strip `http(s)://`.
- `transport` is what the PBX listens on. `tcp` is safest; try `tls` if your
  server insists on encrypted signalling.

To see the raw failure reason, log the registration event:

```tsx
<CallProvider
  onRegistrationStateChanged={(r) => console.log(r.state, r.message)}
/>
```

### `state: progress` forever

The SIP server is unreachable. Check:
- Device has internet.
- Server isn't behind a NAT/firewall blocking your transport.
- Try a different `transport` (`tcp` ↔ `tls`).

### `state: cleared`, never recovers

Something else called `setRegisterEnabled(false)` or you called
`unregister()`. Call `register()` again:

```tsx
const { register } = useCall();
register(config);
```

## Runtime — calls

### Outgoing call shows "OutgoingInit" then immediately "End"

The SIP server rejected the INVITE. Common causes:
- The destination user doesn't exist on the PBX.
- The destination format is wrong — the SDK builds
  `sip:<destination>@<domain>` unless you pass a fully-qualified URI. If
  your PBX expects `sip:<destination>@<gateway>`, pass the URI yourself:
  ```ts
  dial('sip:+2348012345678@gateway.example.com')
  ```

### Incoming call event doesn't fire

In order, check:
1. Registration state is `ok` (see above).
2. **Android**: Foreground service is running. Pull down the notification
   shade — you should see "Ready to receive calls". If not,
   `enableNativeServices` may have been set to false.
3. **iOS**: VoIP push is set up. Without it, incoming calls only arrive
   while the app is foregrounded. See [push-notifications.md](push-notifications.md).
4. Mic permission is granted — some SIP servers refuse to send INVITE if the
   client hasn't ACKed the previous SUBSCRIBE.

### No audio on call

- **Android**: confirm `RECORD_AUDIO` is granted. The provider's
  `onError` will fire with `MIC_PERMISSION_DENIED` if not.
- **iOS**: confirm `NSMicrophoneUsageDescription` is in `Info.plist` and
  the user has accepted the prompt.
- Check the SIP server's codec list overlaps with what Linphone supports.
  Linphone supports PCMU/PCMA/Opus/G722/G729 out of the box.

### One-way audio

Usually NAT. Try:
- Switch transport to `tls` (better RTP encryption + ICE support).
- Confirm your SIP server supports SIP-over-WebSocket or has working
  STUN/TURN/ICE.

### `dial()` returns immediately without ringing

The call status went straight to `Error`. Listen for
`onCallStateChanged` and you'll see `Error` followed by `End`. Inspect the
Linphone logs (Logcat or Xcode console) — look for lines starting with
`liblinphone-`.

### `formattedDuration` doesn't start ticking

The native call state never reached `Connected` / `StreamsRunning`.
That means the SIP `200 OK` never came, or the RTP stream couldn't
establish. See "One-way audio" above.

## Runtime — UI

### Bundled Dialer doesn't dial

Confirm it's *inside* a `<CallProvider>`, with a non-null `config`:

```tsx
<CallProvider config={sip}>
  <Dialer />
</CallProvider>
```

### "useCall must be used inside <CallProvider/>"

The hook is being called from a tree that's outside the provider. Mount
`<CallProvider>` higher up.

### Bundled views feel out-of-place in my design

They're optional — use `useCall()` and build your own. The provider is the
real contract; the components are a starting point.

## Native debugging

### Android — Logcat

Filter by `NativetalkCallSdk.*` or `liblinphone-`:

```
adb logcat -s NativetalkCallSdk.Core:V NativetalkCallSdk.CallService:V liblinphone-android:V
```

### iOS — Xcode console

Filter by `NativetalkCallSdk` or `liblinphone-`.

## Still stuck?

1. Confirm registration state in isolation:
   ```tsx
   const { getRegistrationStatus } = useCall();
   getRegistrationStatus().then(console.log);
   ```
2. Try the included [example app](../example/) against your SIP server —
   it's a known-good consumer.
3. Open an issue with: registration state, call state log, RN version,
   platform, Linphone SDK version, and **redacted** SIP credentials.
