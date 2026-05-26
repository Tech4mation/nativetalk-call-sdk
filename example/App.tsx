/**
 * Minimal example showing the full SDK loop:
 *   - mount <CallProvider> with credentials
 *   - watch registration status
 *   - dial a number with the bundled Dialer
 *   - render the bundled IncomingCallView / OutgoingCallView based on state
 *
 * Run this against your own SIP server by setting SIP_USERNAME / SIP_PASSWORD
 * / SIP_DOMAIN below (or wire it up to your auth flow).
 *
 * No navigation library is used here — the example switches screens by
 * inspecting `useCall()` state. Real apps should plug into React Navigation,
 * Expo Router, or whatever they're already using.
 */
import React, { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CallProvider,
  useCall,
  type SipConfig,
} from '@nativetalk/react-native-call-sdk';
import {
  Dialer,
  IncomingCallView,
  OutgoingCallView,
} from '@nativetalk/react-native-call-sdk/ui';

// ── Replace with your own SIP credentials, or build a login form ──
const DEFAULT_CONFIG: SipConfig = {
  username: '',
  password: '',
  domain: '',
  transport: 'tcp',
};

function CredentialsForm({
  onSubmit,
}: {
  onSubmit: (cfg: SipConfig) => void;
}) {
  const [u, setU] = useState(DEFAULT_CONFIG.username);
  const [p, setP] = useState(DEFAULT_CONFIG.password);
  const [d, setD] = useState(DEFAULT_CONFIG.domain);

  return (
    <ScrollView contentContainerStyle={styles.formWrap}>
      <Text style={styles.title}>SIP credentials</Text>
      <TextInput
        placeholder="Username"
        value={u}
        onChangeText={setU}
        autoCapitalize="none"
        style={styles.input}
      />
      <TextInput
        placeholder="Password"
        value={p}
        onChangeText={setP}
        secureTextEntry
        style={styles.input}
      />
      <TextInput
        placeholder="Domain (e.g. sip.example.com:5060)"
        value={d}
        onChangeText={setD}
        autoCapitalize="none"
        style={styles.input}
      />
      <TouchableOpacity
        onPress={() => onSubmit({ username: u, password: p, domain: d, transport: 'tcp' })}
        style={styles.button}
      >
        <Text style={styles.buttonText}>Connect</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function StatusStrip() {
  const { registration, callStatus, formattedDuration } = useCall();
  const reg = registration?.state ?? 'idle';
  return (
    <View style={styles.statusStrip}>
      <Text style={styles.statusText}>
        SIP: {reg} · {callStatus} · {formattedDuration}
      </Text>
    </View>
  );
}

function Shell() {
  const { incoming, callStatus, incomingInfo } = useCall();
  const inActiveCall = !incoming && callStatus !== 'Idle' && callStatus !== 'End' && callStatus !== 'Released';

  if (incoming) {
    return (
      <IncomingCallView
        location="Demo"
        onDismissed={() => {/* noop — provider clears state */}}
      />
    );
  }

  if (inActiveCall) {
    return (
      <OutgoingCallView
        name={incomingInfo?.name}
        phone={incomingInfo?.phone}
        initials={incomingInfo?.initials}
      />
    );
  }

  return <Dialer />;
}

export default function App() {
  const [config, setConfig] = useState<SipConfig | null>(null);

  if (!config) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="dark-content" />
        <CredentialsForm onSubmit={setConfig} />
      </SafeAreaView>
    );
  }

  return (
    <CallProvider
      config={config}
      onIncomingCall={(info) => console.log('📞 incoming from', info.phone)}
      onCallEnded={() => console.log('☎️ call ended')}
      onRegistrationStateChanged={(r) => console.log('SIP:', r.state, r.message)}
      onError={(e) => console.warn('CallSDK error:', e)}
    >
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="dark-content" />
        <StatusStrip />
        <Shell />
        <TouchableOpacity
          onPress={() => setConfig(null)}
          style={styles.logoutButton}
        >
          <Text style={{ color: '#fff' }}>Sign out</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </CallProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  formWrap: { padding: 20, gap: 12 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#2D6BFF',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  statusStrip: { backgroundColor: '#222', padding: 8 },
  statusText: { color: '#fff', textAlign: 'center', fontSize: 12 },
  logoutButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: '#888',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
});
