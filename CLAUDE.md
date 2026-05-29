# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build       # Compile TS → CommonJS + ESM + type declarations into lib/
npm run typecheck   # Type-check without emitting
npm run clean       # Remove lib/
```

There are no tests or lint scripts. Manual testing is done via the example app:

```bash
cd example && npm run android
cd example && npm run ios -- --device "<device-name>"
```

## Architecture

This is a React Native SIP/VoIP SDK backed by the Linphone 5.x SDK. Three layers communicate via `NativeEventEmitter`:

```
Host App (React)
  └─ <CallProvider>  →  useCall()  →  CallApi (state + actions)
       │
       │  NativeEventEmitter (4 events: registration, call_state, incoming_call, call_log)
       ▼
  NativeModules.NativetalkCallSdk
       ├─ Android: NativetalkCallSdkModule.kt  (JS bridge)
       │           CoreManager.kt              (Linphone Core singleton)
       │           BackgroundService.kt        (keeps registration alive)
       │           CallService.kt              (foreground service during calls)
       │           TelephonyMonitor.kt         (detects GSM calls)
       │           NativetalkCallScreeningService.kt (call screening)
       │           Compatibility.kt            (API-level shims)
       └─ iOS:     NativetalkCallSdk.swift     (Linphone + CallKit/PushKit)
                   NativetalkCallSdkBridge.m   (React module registration)
       │
       ▼
  Linphone SDK 5.x (SIP stack, audio engine)
```

### JS layer (`src/`)

| File | Role |
|------|------|
| `index.ts` | Public entry point — all exports |
| `CallProvider.tsx` | React context; owns registration + call state machines; subscribes to NativeEventEmitter |
| `native.ts` | Thin bridge to `NativeModules.NativetalkCallSdk`; platform guards for Android-only/iOS-only methods |
| `types.ts` | All public TypeScript types (`SipConfig`, `CallState`, `CallApi`, `CallLogEntry`, …) |
| `helpers.ts` | Pure utilities: `formatDuration`, `parseSipUser`, `sanitizeDial`, `destinationToSipUri` |
| `ui/` | Optional pre-built screens (Dialer, IncomingCallView, OutgoingCallView); no external UI deps |

### State machines

**Registration:** `none → progress → ok/failed → cleared`

**Call:** `Idle → IncomingReceived | OutgoingInit → Connected/StreamsRunning → End/Released`

`CallProvider` groups Linphone's ~20 raw states into logical buckets (`ACTIVE`, `TERMINAL`, `HELD`, `RESUMED`) and exposes them via `callStatus`.

### Key design constraints

- **One Core per process.** `CoreManager` is a singleton; mounting multiple `<CallProvider>` instances is not supported.
- **No coupling to host concerns.** The SDK never navigates, fetches auth tokens, or merges call logs with a backend. Config is injected via props; navigation is handled through callbacks (`onIncomingCall`, `onCallEnded`, etc.).
- **`CallEngine` escape hatch.** `CallEngine.dial()`, `CallEngine.answer()`, etc. call the native bridge directly — use this in headless tasks, background services, and push notification handlers where React context isn't available.
- **Platform guards.** `startNativeServices`/`stopNativeServices`/`requestMicPermission` are Android-only; `registerVoipToken` is iOS-only. Calling them on the wrong platform is a no-op.

### Build outputs

`lib/commonjs/` (CJS for RN metro), `lib/module/` (ESM), `lib/typescript/` (`.d.ts`). The `main`, `module`, and `types` fields in `package.json` point to these.

### Example app

`example/` is a minimal RN app (no navigation library — screen switching is driven purely by `useCall()` state). It resolves the SDK via `"@nativetalk/react-native-call-sdk": "link:.."` for local development.

### Documentation

Comprehensive guides live in `docs/`:  `architecture.md`, `api-reference.md`, `quickstart.md`, `configuration.md`, `android-setup.md`, `ios-setup.md`, `push-notifications.md`, `ui-components.md`, `troubleshooting.md`.
