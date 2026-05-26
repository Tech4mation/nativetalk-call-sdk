# Configuration

Every knob on `<CallProvider>`.

## Props

```tsx
<CallProvider
  // --- Config ---
  config={null | SipConfig}
  autoRegister={true}              // optional, default true
  enableNativeServices={true}      // optional, default true (Android only)
  requestMicPermission={true}      // optional, default true

  // --- Events ---
  onIncomingCall={(info) => …}
  onOutgoingCall={({ phone, initials }) => …}
  onCallEnded={() => …}
  onCallStateChanged={(state) => …}
  onRegistrationStateChanged={(event) => …}
  onError={({ code, message }) => …}
>
  …
</CallProvider>
```

### `config`

```ts
type SipConfig = {
  username: string;
  password: string;
  domain: string;             // hostname[:port], no scheme
  transport?: 'udp' | 'tcp' | 'tls';   // default 'tcp'
};
```

- Pass `null` or `undefined` while you're loading credentials.
- The SDK strips `http://`, `https://`, and trailing slashes from `domain`.
- Include the port if it's non-standard: `'sip.example.com:5061'`.
- Re-render the provider with a *new* config object whenever you want to
  re-register (the SDK detects identity changes and wipes the previous account).

### `autoRegister`

If `true`, the SDK calls `register()` automatically whenever `config` changes
(by identity — a new object reference). If `false`, you must call
`useCall().register()` yourself.

```tsx
<CallProvider config={sip} autoRegister={false}>
  {/* user must call register() manually */}
</CallProvider>
```

### `enableNativeServices`

**Android only.** If `true` (the default), the SDK starts a foreground
background-service so incoming calls arrive even when the app is backgrounded.

Set to `false` if:
- You're integrating with a custom call infrastructure that already keeps the
  registration warm (e.g. via push wake-up + manual `register()`).
- You're building a foreground-only "softphone-on-screen" app.

iOS uses VoIP push + CallKit instead — this flag has no effect there.

### `requestMicPermission`

If `true` (the default), the SDK prompts for `RECORD_AUDIO` on Android during
provider mount. Set to `false` if you have a custom permission flow.

### Event callbacks

All event callbacks are optional. They are called in addition to the state
exposed by `useCall()`.

| Callback | Fired when |
|---|---|
| `onIncomingCall(info)` | A new incoming call arrives. `info` has `name`, `phone`, `initials`, `callId`, `uri`. |
| `onOutgoingCall({phone, initials})` | After `dial()` is called. |
| `onCallEnded()` | The active call has ended for any reason. |
| `onCallStateChanged(state)` | On every state transition. `state` is a [`CallState`](api-reference.md#callstate). |
| `onRegistrationStateChanged(event)` | On every SIP registration transition. |
| `onError({code, message})` | A user-actionable error occurred. See [error codes](#error-codes). |

Callbacks are read on every call via refs, so you can pass new closures on
every render without re-subscribing the underlying native events.

## Error codes

| Code | Meaning | What you can do |
|---|---|---|
| `INIT_FAILED` | Native core failed to start. | Check Linphone framework is bundled; restart app. |
| `MIC_PERMISSION_DENIED` | User declined mic permission. | Re-prompt explicitly later, or disable calling. |
| `REGISTRATION_FAILED` | SIP registration was rejected. | Check `username` / `password` / `domain` / `transport`. |
| `NO_CONFIG` | Tried to call or register without a config. | Pass `config` to `<CallProvider>` or `register(cfg)`. |
| `INVALID_NUMBER` | `dial()` called with empty string. | Validate input before calling. |
| `REGISTER_FAILED` | `register()` threw during apply. | Check logs; usually a transport mismatch. |
| `GET_CALL_LOGS_FAILED` | Native call-log read failed. | Usually recoverable; retry. |

## Re-registration

```tsx
const { refreshRegistration, unregister, register } = useCall();

// Lightweight re-register (uses cached credentials).
refreshRegistration();

// Drop registration (e.g. on logout).
unregister();

// Switch to a different account.
register({ username, password, domain, transport: 'tls' });
```

## Lifecycle

Android only:

```tsx
const { startNativeServices, stopNativeServices } = useCall();

// On login (already done automatically if enableNativeServices=true)
startNativeServices();

// On logout
stopNativeServices(/* logout */ true);
```

`stopNativeServices(true)` also tells the background service *not* to
auto-restart when the task is removed — important for clean logout.
