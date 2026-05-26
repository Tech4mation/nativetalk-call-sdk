# API reference

The complete public surface of `@nativetalk/react-native-call-sdk`.

## Components

### `<CallProvider>`

```tsx
<CallProvider {...CallProviderProps}>{children}</CallProvider>
```

See [configuration.md](configuration.md) for every prop.

## Hooks

### `useCall(): CallApi`

Read the call state and trigger actions. Must be used inside `<CallProvider>`.

```ts
interface CallApi {
  // Config
  config: SipConfig | null;

  // State
  registration: RegistrationEvent | null;
  callStatus: CallState;
  durationSec: number;
  formattedDuration: string;          // "1:23" or "1:05:34"
  incoming: boolean;
  incomingInfo: IncomingCallInfo | null;
  isMuted: boolean;
  isSpeaker: boolean;
  isHeld: boolean;

  // Controls
  dial(destination: string): Promise<void>;
  answer(): Promise<void>;
  hangup(): Promise<void>;
  decline(reason?: DeclineReason): Promise<void>;
  toggleMute(): void;
  toggleSpeaker(): void;
  toggleHold(): void;
  sendDtmf(digit: string): void;
  playKeyTone(digit: string): void;   // local DTMF tone for dial-pad feedback

  // Registration
  register(config?: SipConfig): Promise<void>;
  refreshRegistration(): Promise<void>;
  unregister(): Promise<void>;

  // Queries
  getCallLogs(): Promise<CallLogEntry[]>;
  getRegistrationStatus(): Promise<RegistrationEvent>;

  // Lifecycle (Android only — no-ops on iOS)
  startNativeServices(): void;
  stopNativeServices(logout?: boolean): void;
}
```

### `useCallSafe(): CallApi | null`

Same as `useCall()`, but returns `null` instead of throwing when used outside
the provider. Use when you have shared code that may render in either context.

## Types

### `SipConfig`

```ts
interface SipConfig {
  username: string;
  password: string;
  domain: string;                   // host[:port]
  transport?: 'udp' | 'tcp' | 'tls';
}
```

### `SipTransport`

```ts
type SipTransport = 'udp' | 'tcp' | 'tls';
```

### `RegistrationState`

```ts
type RegistrationState =
  | 'none'
  | 'progress'
  | 'ok'
  | 'cleared'
  | 'failed'
  | 'unknown';
```

### `RegistrationEvent`

```ts
interface RegistrationEvent {
  state: RegistrationState;
  pretty?: string;
  message?: string;
  username?: string;
  domain?: string;
  displayName?: string;
}
```

### `CallState`

```ts
type CallState =
  | 'Idle'
  | 'IncomingReceived'
  | 'PushIncomingReceived'
  | 'OutgoingInit'
  | 'OutgoingProgress'
  | 'OutgoingRinging'
  | 'OutgoingEarlyMedia'
  | 'Connected'
  | 'StreamsRunning'
  | 'Pausing'
  | 'Paused'
  | 'Resuming'
  | 'PausedByRemote'
  | 'IncomingEarlyMedia'
  | 'End'
  | 'Released'
  | 'Error'
  | ...
;
```

The most common terminal mappings for UI:

| Raw state | What you usually show |
|---|---|
| `OutgoingInit`, `OutgoingProgress`, `OutgoingEarlyMedia` | "Calling…" |
| `OutgoingRinging` | "Ringing…" |
| `Connected`, `StreamsRunning` | "In progress" + timer |
| `Pausing`, `Paused`, `PausedByRemote` | "On hold" |
| `End`, `Released` | "Call ended" |
| `Error` | "Call failed" |

You can use the `callStatusLabel(status)` helper to do this mapping for you.

### `IncomingCallInfo`

```ts
interface IncomingCallInfo {
  name: string;        // best-effort display name
  phone: string;
  initials: string;    // first two chars uppercased
  callId?: string;
  uri?: string;        // sip:user@domain
}
```

### `CallLogEntry`

```ts
interface CallLogEntry {
  id: number;
  call_start: string;          // ISO-8601 UTC
  call_type: 'LOCAL' | 'DID' | 'STANDARD' | string;
  caller_id: string;           // "user <user>"
  call_direction: 'inbound' | 'outbound' | string;
  called_number: string;
  disposition:
    | { text: string; code: number }   // Android shape
    | string;                          // iOS shape — see notes
  debit: string;
  duration: string;                    // "MM:SS"
  destination: string;
  sip_user: string;
  created_at: string;
  updated_at: string;
}
```

> The platform difference on `disposition` is preserved intentionally — both
> are useful and apps typically format them into their own model anyway.
> See [architecture.md](architecture.md) if you'd like a single shape.

### `DeclineReason`

```ts
type DeclineReason =
  | 'declined'                // default
  | 'busy'                    // 486
  | 'notacceptable'           // 406
  | 'temporarilyunavailable'; // 480
```

### `CallProviderProps`

See [configuration.md](configuration.md).

## Helpers

All pure functions. No React, no native, no side effects.

```ts
function formatDuration(seconds: number): string;
// formatDuration(65) === "1:05"
// formatDuration(3725) === "1:02:05"

function callStatusLabel(status: CallState): string;
// callStatusLabel('StreamsRunning') === "In progress"

function callStateName(raw: unknown): CallState;
// callStateName(8) === "StreamsRunning"
// callStateName('Connected') === "Connected"

function regStateName(raw: unknown): RegistrationState;

function parseSipUser(sipUri: string): string;
// parseSipUser('sip:100@host') === "100"

function sanitizeDial(input: string): string;
// sanitizeDial('+1 (234) 567') === "+1234567"

function formatTenantDomain(domain: string | null | undefined): string;
// formatTenantDomain('https://x.com/') === "x.com"

function destinationToSipUri(destination: string, domain: string): string;
// destinationToSipUri('100', 'x.com') === "sip:100@x.com"

function initialsFrom(name: string | null | undefined): string;
```

## Escape hatch: `CallEngine`

When you need to drive the SDK from outside React — e.g. a headless task on
Android, or wiring up `registerVoipToken(hex)` from a VoIP push handler — use
`CallEngine`.

```ts
import { CallEngine } from '@nativetalk/react-native-call-sdk';

CallEngine.init();
CallEngine.register({ username, password, domain });
CallEngine.call('sip:100@sip.example.com');
CallEngine.answer();
CallEngine.end();

// Event subscriptions (returns { remove })
const sub = CallEngine.on.CallIncoming((e) => console.log(e));
sub.remove();

// iOS-only — pass the VoIP push token from your AppDelegate.
CallEngine.registerVoipToken('abcd1234…');
```

**Prefer `useCall()` whenever you can.** The hook keeps React state in sync
with native events automatically; `CallEngine` does not.

## Raw event emitter

For specialised needs you can subscribe to the raw event stream:

```ts
import { callEvents } from '@nativetalk/react-native-call-sdk';

const sub = callEvents.addListener('RegistrationChanged', (e) => …);
sub.remove();
```

Available events: `RegistrationChanged`, `CallIncoming`, `CallState`,
`CallEnded`, `TMPhoneCallState`, `TMPhoneCallInfo` (the last two are
Android-only telephony observer events).

## Bundled UI

See [ui-components.md](ui-components.md).
