# Architecture

How the SDK is wired together and why.

## High-level

```
┌─────────────────────────────────────────────────────────────┐
│  Your app (React Native, TypeScript)                        │
│                                                             │
│   <CallProvider>            useCall()                       │
│       │   │                       │                         │
│       ▼   └── exposes ─────► CallApi (state + actions)      │
└───────│─────────────────────────────────────────────────────┘
        │ subscribes/dispatches via NativeEventEmitter
        ▼
┌─────────────────────────────────────────────────────────────┐
│  Native bridge (NativetalkCallSdk module)                   │
│                                                             │
│   Android: NativetalkCallSdkModule.kt + CoreManager.kt      │
│   iOS:     NativetalkCallSdk.swift                          │
└───────│─────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  Linphone SDK 5.x   (Android: AAR, iOS: xcframework)         │
└─────────────────────────────────────────────────────────────┘
```

## Layers

### 1. React layer (`src/`)

Pure TypeScript. Knows about React but not about any specific HTTP client,
nav library, or auth system.

- `CallProvider.tsx` — context + state + event subscriptions
- `useCall.ts` — public hook
- `native.ts` — thin JS wrapper over `NativeModules.NativetalkCallSdk`
- `helpers.ts` — pure utility functions
- `ui/` — optional drop-in screens; not required to use the SDK

The single source of truth for "what state is the call in" is the native
`Core`. The provider just reflects the state it receives via events.

### 2. Native module (`android/`, `ios/`)

Thin native wrappers that translate JS calls into Linphone calls and
forward Linphone events back to JS. Method-for-method symmetric across
platforms.

- **Android:** `NativetalkCallSdkModule` delegates everything to
  `CoreManager` (a singleton). The singleton model means a push-driven
  background service can manipulate the same `Core` instance that JS uses
  once React boots.
- **iOS:** Single Swift class (`NativetalkCallSdk`) — iOS owns its
  lifecycle through the React module lifecycle plus CallKit/PushKit hooks
  in the host app.

### 3. Linphone

The SIP/VoIP/audio engine. We don't touch its internals — we use:

- `Core` for signalling
- `Account` / `ProxyConfig` for SIP registration
- `Call` for individual calls
- `AudioDevice` for input/output routing
- `CoreListenerStub` for events

## Design decisions

### Decoupled from host concerns

The original implementation pulled `useAuth`, hard-coded navigation calls,
and reached into an axios instance. None of that lives in the SDK:

| Concern | How the SDK handles it |
|---|---|
| Auth | `config` prop. SDK is idle until config arrives. |
| Navigation | `onIncomingCall` / `onCallEnded` callbacks. SDK never navigates. |
| API calls (CDRs) | Out of scope — get them from your backend, merge with `getCallLogs()` if you want. |
| Persistence | None — the host app owns SIP credentials. |
| Logging | Goes to the platform log (Logcat / `NSLog`). |

### Single CallProvider, single context

Multiple `<CallProvider>` instances aren't supported — the underlying
Linphone `Core` is a process-wide singleton. Mount one near the root of
your app tree.

### Optional UI

The Dialer / IncomingCallView / OutgoingCallView components exist so apps
can get something on screen in minutes. They are intentionally minimal
(no vector icons, no animation libs) so they work in any RN project. You're
expected to replace them once your design matures.

### Why `CallEngine` as an escape hatch

Push handlers, background tasks, and CallKit delegates run **before** React
is initialised. They need a way to drive the native module without going
through hooks. `CallEngine` is that escape hatch — it's a 1:1 mirror of the
JS bridge.

## State machine

```
                          register()
              ┌──────────────────────────────┐
              ▼                              │
        ┌──────────┐    progress      ┌─────────────┐
        │ unreg'd  │───────────────►  │ progressing │
        └──────────┘                  └─────────────┘
              ▲                              │
              │                              ▼
        cleared │              ┌───────────────────────┐
              │                │       ok / failed     │
              │                └───────────────────────┘
              │                              │
              └──────────────────────────────┘
                   unregister() / failure
```

```
                       ┌───────┐
                       │ Idle  │
                       └───┬───┘
                           │
                           │ CallIncoming                dial()
                           ▼                              │
                  ┌────────────────────┐         ┌────────▼─────────┐
                  │ IncomingReceived   │         │ OutgoingInit/    │
                  └────────────────────┘         │ Progress/Ringing │
              answer()│  decline()                └────────┬─────────┘
                      ▼                                    │
              ┌────────────────────┐                       │
              │ Connected /         │ ◄─────────────────────┘
              │ StreamsRunning      │
              └────────────────────┘
                   hangup() │
                            ▼
                  ┌────────────────────┐
                  │ End / Released     │
                  └────────────────────┘
```

## Files & responsibilities

| File | What it owns |
|---|---|
| `src/CallProvider.tsx` | React state, event wiring, public API |
| `src/native.ts` | NativeModules + NativeEventEmitter façade |
| `src/helpers.ts` | Pure utilities |
| `src/ui/*` | Optional bundled screens |
| `android/.../CoreManager.kt` | Linphone `Core` lifecycle, registration, calls, notifications |
| `android/.../NativetalkCallSdkModule.kt` | JS bridge methods |
| `android/.../BackgroundService.kt` | Long-running foreground service to keep registration warm |
| `android/.../CallService.kt` | Foreground service that owns the call notification |
| `android/.../TelephonyMonitor.kt` | Native GSM call observation (optional) |
| `ios/NativetalkCallSdk.swift` | Linphone bridge + audio session + DTMF tone gen |
| `ios/NativetalkCallSdkBridge.m` | React Native method exports |
