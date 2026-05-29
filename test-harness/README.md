# Call SDK · Test Harness

A multi-tab React Native app that exercises every public surface of
`@nativetalk/react-native-call-sdk` so SDK changes can be verified end-to-end
without writing a new test app each time.

> Want a minimal "hello world" instead? See `../example/` — this harness is
> the heavier sibling for debugging, regression-testing, and dogfooding new
> SDK changes.

## What it covers

| Tab          | Surface tested                                                                                            |
|--------------|-----------------------------------------------------------------------------------------------------------|
| **Connection** | `SipConfig` form (username / password / domain / transport), live `registration` state, `register()`, `refreshRegistration()`, `unregister()`, `getRegistrationStatus()`, `startNativeServices()` / `stopNativeServices()`. |
| **Dial**       | Manual destination input with **live `sanitizeDial()` and `destinationToSipUri()` previews**, `dial()`, and the bundled `<Dialer />` component side-by-side. |
| **Active Call** | All in-call state from `useCall()` (status, duration, incoming info), `answer()` / `hangup()` / `decline(reason)` for incoming, `toggleMute()` / `toggleSpeaker()` / `toggleHold()`, and a 12-key pad that fires `sendDtmf()` + `playKeyTone()`. |
| **Events**     | Live timestamped feed of every CallProvider callback (`onRegistrationStateChanged`, `onIncomingCall`, `onOutgoingCall`, `onCallStateChanged`, `onCallEnded`, `onError`) plus raw native bridge events. Filter by category, share/export, clear. |
| **Call Logs**  | `getCallLogs()` rendered as inspectable cards (cross-platform disposition handling included). |
| **Bundled UI** | Renders `<Dialer />`, `<IncomingCallView />`, `<OutgoingCallView />`, and `<Avatar />` against the live `useCall()` state. |
| **Helpers**    | Interactive playground for every pure helper export: `formatTenantDomain`, `parseSipUser`, `sanitizeDial`, `initialsFrom`, `formatDuration`, `destinationToSipUri`, `callStateName`, `regStateName`, `callStatusLabel`. |
| **Engine**     | Direct escape-hatch calls into the `CallEngine` proxy (`init`, `getRegistrationStatus`, `setRegisterEnabled`, `refreshRegisters`, `ensureMicPermission`, raw `call(uri)`, `registerVoipToken`, raw event subscriptions). |

A persistent status strip across the top shows registration, current call
state, duration, and the running event count — so you can see the SDK state
without leaving the current tab.

## Running

This harness uses `npm link`-style local resolution
(`"@nativetalk/react-native-call-sdk": "link:.."`) and Metro's
`extraNodeModules` so edits to the SDK's `../src` are picked up immediately —
no `npm publish` step.

```bash
# 1. Install SDK deps (one time, from the SDK root)
cd ..
npm install

# 2. Install harness deps
cd test-harness
npm install

# 3. iOS pods (only after native dep changes)
cd ios && pod install && cd ..

# 4. Run
npm run android   # device or emulator
npm run ios       # use --device "Your iPhone" — see note below
```

> **VoIP does not work on iOS simulators** — there's no microphone and no
> PushKit. Use a real iPhone for any test that involves actual media.

### Type-check only

```bash
npm run lint   # tsc --noEmit against the harness
```

## Suggested test flow

1. **Connection tab** — enter SIP creds, hit **Apply / Reconnect**. Watch the
   registration pill flip `progress → ok` (or `failed` with a useful
   `message`).
2. **Events tab** — confirm `onRegistrationStateChanged` fired with the right
   payload. Filter by `registration` to isolate.
3. **Dial tab** — type a number with garbage in it (`+1 (555) 010-0000 x42`)
   and confirm `sanitizeDial()` and `destinationToSipUri()` previews update
   live. Hit `dial()`.
4. **Active Call tab** — the harness auto-jumps here on an incoming call.
   Exercise mute, speaker, hold, DTMF, hangup. Confirm the duration timer
   stays accurate across hold/resume and backgrounding.
5. **Engine tab** — try `setRegisterEnabled(false)` and confirm the
   registration pill drops to `cleared`. Re-enable to verify recovery.
6. **Call Logs tab** — hit Fetch after the call ends; confirm the new entry
   appears with the right direction / duration / disposition.
7. **Bundled UI tab** — flip through Dialer / Incoming / Outgoing previews
   to spot-check visual regressions in the shipped components.

## Architecture

```
test-harness/
├── App.tsx                       # Credentials gate → <CallProvider> → tab shell
├── src/
│   ├── theme.ts                  # Dark palette + spacing/radius scale
│   ├── components/               # Button, Section, Pill, KeyValue, Input, Row
│   ├── context/
│   │   └── EventLog.tsx          # Rolling 500-entry log + useEventLog()
│   └── screens/
│       ├── ConnectionScreen.tsx
│       ├── DialerScreen.tsx
│       ├── ActiveCallScreen.tsx
│       ├── EventLogScreen.tsx
│       ├── CallLogsScreen.tsx
│       ├── UIPreviewScreen.tsx
│       ├── HelpersScreen.tsx
│       └── EngineScreen.tsx
├── babel.config.js
├── metro.config.js               # Resolves SDK from sibling ../src
├── tsconfig.json
├── index.js
├── app.json
└── package.json
```

The root `<CallProvider>` wires every event callback into the shared
`EventLog` context. Every screen reads `useCall()` and pushes a log entry on
each action so the Events tab shows both the SDK-originating events and the
user-originating actions in a single feed.

## Notes

- Designed for engineers debugging the SDK, not for end users — the UI shows
  raw state names (`StreamsRunning`, `PausedByRemote`, etc.) rather than
  user-friendly labels. Compare against `callStatusLabel()` in the Helpers
  tab.
- Event log is in-memory only (500-entry rolling buffer). Use **Share /
  Export** to dump it to clipboard / email / a chat for bug reports.
- No navigation library — tabs are state-driven so the harness can render in
  any host (including from CI test runners that drive it via remote control).
