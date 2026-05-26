# Call SDK example app

A bare-bones React Native app that uses every public surface of
`@nativetalk/react-native-call-sdk`:

- A credentials form that builds a `SipConfig`.
- Mounts `<CallProvider>` with the entered credentials.
- Switches between the bundled `<Dialer>`, `<IncomingCallView>`, and
  `<OutgoingCallView>` based on call state.

## Running

This example uses `npm link`-style local resolution (`"@nativetalk/react-native-call-sdk": "link:.."`)
so you can iterate on the SDK and the example side by side.

```bash
# 1. Install SDK deps and build types
cd ..
npm install

# 2. Install example deps
cd example
npm install

# 3. iOS pods (one-time per change to native deps)
cd ios && pod install && cd ..

# 4. Run
npm run android   # device or emulator
npm run ios -- --device "Your iPhone"
```

> **VoIP does not work on iOS simulators** — there's no microphone and no
> PushKit. Use a real iPhone.

## What you'll see

1. A SIP credentials form on first launch.
2. Enter username / password / domain → press **Connect**.
3. The status strip at the top shows `SIP: ok · Idle · 0:00` once registered.
4. Dial a number → status goes through `OutgoingProgress → Ringing → Connected`.
5. From another endpoint, ring this user — the screen flips to the incoming
   call view automatically.

## Notes for your real app

This example uses no navigation library — screens switch by inspecting
`useCall()` state directly. In a real app you almost certainly want
React Navigation or Expo Router, with the SDK's `onIncomingCall` /
`onCallEnded` callbacks driving the navigation transitions. See
[docs/quickstart.md](../docs/quickstart.md) for a navigation-aware example.
