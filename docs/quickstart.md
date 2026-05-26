# Quick start

A working softphone in ~50 lines.

## 1. Minimal app

```tsx
// App.tsx
import React from 'react';
import { SafeAreaView, Text, View } from 'react-native';
import { CallProvider, useCall } from '@nativetalk/react-native-call-sdk';
import { Dialer } from '@nativetalk/react-native-call-sdk/ui';

const sip = {
  username: '100',
  password: 'secret',
  domain: 'sip.example.com',
  transport: 'tcp' as const,
};

function StatusBar() {
  const { registration, callStatus, formattedDuration } = useCall();
  return (
    <View style={{ padding: 12, backgroundColor: '#222' }}>
      <Text style={{ color: '#fff' }}>
        SIP: {registration?.pretty ?? 'idle'} · {callStatus} · {formattedDuration}
      </Text>
    </View>
  );
}

export default function App() {
  return (
    <CallProvider
      config={sip}
      onIncomingCall={(info) => {
        console.log('📞 Incoming from', info.phone);
        // In a real app: navigation.navigate('IncomingCall', info)
      }}
      onError={(e) => console.warn('Call SDK error:', e)}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar />
        <Dialer />
      </SafeAreaView>
    </CallProvider>
  );
}
```

That's it. Press a number, tap call.

## 2. Wire incoming calls to a screen

Most apps want the incoming call to take over the screen. The SDK doesn't
ship a navigator — use yours.

```tsx
// With @react-navigation/native:
import { useNavigation } from '@react-navigation/native';

function CallShell({ children }) {
  const nav = useNavigation();
  return (
    <CallProvider
      config={sip}
      onIncomingCall={() => nav.navigate('IncomingCall')}
      onCallEnded={() => nav.goBack()}
    >
      {children}
    </CallProvider>
  );
}
```

Then in your `IncomingCall` screen:

```tsx
import { IncomingCallView } from '@nativetalk/react-native-call-sdk/ui';
import { useNavigation } from '@react-navigation/native';

export function IncomingCallScreen() {
  const nav = useNavigation();
  return (
    <IncomingCallView
      onAnswered={() => nav.replace('InCall')}
      onDeclined={() => nav.goBack()}
      onDismissed={() => nav.goBack()}
    />
  );
}
```

And the in-call screen:

```tsx
import { OutgoingCallView } from '@nativetalk/react-native-call-sdk/ui';
import { useNavigation, useRoute } from '@react-navigation/native';

export function InCallScreen() {
  const nav = useNavigation();
  const { params } = useRoute();
  return (
    <OutgoingCallView
      name={params?.name}
      phone={params?.phone}
      initials={params?.initials}
      onEnded={() => nav.goBack()}
    />
  );
}
```

## 3. Use the hook in your own UI

If you want a fully custom UI, ignore the bundled components and just use
`useCall()`:

```tsx
import { useCall } from '@nativetalk/react-native-call-sdk';

function MyDialer() {
  const { dial, callStatus, hangup } = useCall();
  return (
    <View>
      <Button title="Call ext 100" onPress={() => dial('100')} />
      <Text>{callStatus}</Text>
      <Button title="Hang up" onPress={hangup} />
    </View>
  );
}
```

## 4. Fetch credentials async

You usually don't ship hard-coded SIP credentials — you fetch them from your
backend after login. The provider tolerates `null`:

```tsx
const [cfg, setCfg] = useState(null);

useEffect(() => {
  fetch('/api/sip-credentials').then(r => r.json()).then(setCfg);
}, []);

return (
  <CallProvider config={cfg}>
    {/* …app… */}
  </CallProvider>
);
```

With `autoRegister={true}` (the default), the SDK calls `register()` the
moment `cfg` becomes non-null.

## 5. Run on a device

VoIP doesn't work on simulators on iOS (no microphone, no audio output).
Use a real device for iOS testing. Android emulators work fine.

```bash
npm run android   # device or emulator
npm run ios -- --device "iPhone of <name>"
```

If something doesn't work as expected, walk through [troubleshooting.md](troubleshooting.md).
