# UI components

The SDK ships three optional components. They are **completely opt-in** — the
`useCall()` hook gives you everything you need to roll your own.

These components use only React Native primitives — no `react-native-vector-icons`,
no SVG library, no navigation library, no asset files. Drop them into any
project.

Import from the `/ui` sub-path:

```tsx
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

## `<Dialer />`

The classic 3×4 dial-pad with input and call button.

```tsx
<Dialer
  initialValue=""
  onDialed={(number) => console.log('dialed', number)}
  header={<MyLogo />}
  theme={{ primary: '#000', answer: '#0a0' }}
  playKeyTones
/>
```

| Prop | Type | Default | What it does |
|---|---|---|---|
| `initialValue` | `string` | `''` | Pre-fills the input. |
| `onDialed` | `(n: string) => void` | — | Called after `dial()` returns. |
| `header` | `ReactNode \| null` | `null` | Rendered above the input. Pass `null` to hide. |
| `renderCallButton` | `({ onPress, disabled, number }) => ReactNode` | — | Replaces the green call button. |
| `theme` | `Partial<CallTheme>` | — | Overrides for colours. |
| `playKeyTones` | `boolean` | `true` | Play a local DTMF feedback tone on each key press. |

## `<IncomingCallView />`

Full-screen UI for a ringing incoming call. Reads everything from
`useCall().incomingInfo`.

```tsx
<IncomingCallView
  onAnswered={() => navigation.replace('InCall')}
  onDeclined={() => navigation.goBack()}
  onDismissed={() => navigation.goBack()}
  location="Lagos, Nigeria"
  title="Incoming call"
  theme={{ answer: '#3c0', decline: '#c00' }}
  header={<MyLogo />}
/>
```

| Prop | Type | What it does |
|---|---|---|
| `onAnswered` | `() => void` | Fired after the user taps Answer **and** `answer()` resolves. |
| `onDeclined` | `() => void` | Fired after the user taps Decline. |
| `onDismissed` | `() => void` | Fired if the screen mounts but there's no incoming call (e.g. caller hung up). |
| `title` | `string` | Default `"Incoming call"`. |
| `location` | `string` | Optional location label under the caller name. |
| `theme` | `Partial<CallTheme>` | Colour overrides. |
| `header` | `ReactNode` | Rendered at the top. |

## `<OutgoingCallView />`

Full-screen UI for an in-progress call. Used both for outgoing calls and
after answering an incoming one.

```tsx
<OutgoingCallView
  name="Jane Doe"
  phone="+2348012345678"
  initials="JD"
  location="Lagos, Nigeria"
  onEnded={() => navigation.goBack()}
  theme={{ primary: '#000' }}
/>
```

| Prop | Type | What it does |
|---|---|---|
| `name` | `string` | Caller name to show. |
| `phone` | `string` | Phone/SIP identifier. |
| `initials` | `string` | Two-character avatar initials. |
| `location` | `string` | Optional sub-label. |
| `onEnded` | `() => void` | Fired after the user taps End. |
| `theme` | `Partial<CallTheme>` | Colour overrides. |
| `header` | `ReactNode` | Rendered at the top. |

## Theming

The default theme:

```ts
{
  primary: '#2D6BFF',
  background: '#fafafa',
  text: '#111',
  subtext: '#555',
  answer: '#33c124',
  decline: '#ff2d2d',
  controlOnBg: '#111',
  controlOffBg: '#fff',
  controlIconOn: '#fff',
  controlIconOff: '#111',
}
```

Override per-component via the `theme` prop. For app-wide theming, build your
own wrapper:

```tsx
const myTheme = { primary: '#000', answer: '#0a0', decline: '#c00' };

const MyDialer = (props) => <Dialer theme={myTheme} {...props} />;
const MyIncoming = (props) => <IncomingCallView theme={myTheme} {...props} />;
const MyOutgoing = (props) => <OutgoingCallView theme={myTheme} {...props} />;
```

## Building your own UI

The bundled components are intentionally simple — text-emoji icons, no
animations, no navigation integration. For richer UI, ignore them and use
`useCall()` directly. The provider + hook are the actual contract.

Example: a minimal custom in-call screen.

```tsx
import { useCall } from '@nativetalk/react-native-call-sdk';

function CustomCallScreen() {
  const {
    callStatus, formattedDuration,
    isMuted, isSpeaker,
    hangup, toggleMute, toggleSpeaker, sendDtmf,
  } = useCall();

  return (
    <View>
      <Text>{callStatus} · {formattedDuration}</Text>
      <Button title={isMuted ? 'Unmute' : 'Mute'} onPress={toggleMute} />
      <Button title={isSpeaker ? 'Earpiece' : 'Speaker'} onPress={toggleSpeaker} />
      <Button title="End" onPress={hangup} />
      {/* DTMF keypad */}
      <View style={{ flexDirection: 'row' }}>
        {'0123456789*#'.split('').map(d => (
          <Button key={d} title={d} onPress={() => sendDtmf(d)} />
        ))}
      </View>
    </View>
  );
}
```
