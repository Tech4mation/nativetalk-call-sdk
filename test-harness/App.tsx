/**
 * Nativetalk Call SDK — test harness root.
 *
 * Renders a credentials gate, then mounts <CallProvider> with the entered
 * config. Inside the provider, a bottom-tab shell switches between the
 * specialised test screens (registration, dial, call controls, event log,
 * call logs, UI previews, helpers, engine escape-hatch).
 *
 * Every CallProvider event (onIncomingCall, onCallStateChanged, etc.) is
 * forwarded into the EventLog context so the Events tab shows a live feed
 * of everything the SDK emits.
 */
import React, { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CallProvider,
  useCall,
  type SipConfig,
} from '@nativetalk/react-native-call-sdk';

import { Button } from './src/components/Button';
import { Input } from './src/components/Input';
import { Pill } from './src/components/Pill';
import { Row } from './src/components/Row';
import { Section } from './src/components/Section';
import { EventLogProvider, useEventLog } from './src/context/EventLog';
import { ActiveCallScreen } from './src/screens/ActiveCallScreen';
import { CallLogsScreen } from './src/screens/CallLogsScreen';
import { ConnectionScreen } from './src/screens/ConnectionScreen';
import { DialerScreen } from './src/screens/DialerScreen';
import { EngineScreen } from './src/screens/EngineScreen';
import { EventLogScreen } from './src/screens/EventLogScreen';
import { HelpersScreen } from './src/screens/HelpersScreen';
import { UIPreviewScreen } from './src/screens/UIPreviewScreen';
import { radius, space, theme } from './src/theme';

type TabId =
  | 'status'
  | 'dial'
  | 'call'
  | 'events'
  | 'logs'
  | 'ui'
  | 'helpers'
  | 'engine';

interface Tab {
  id: TabId;
  label: string;
  short: string;
}

const TABS: Tab[] = [
  { id: 'status', label: 'Connection', short: 'Conn' },
  { id: 'dial', label: 'Dial', short: 'Dial' },
  { id: 'call', label: 'Active Call', short: 'Call' },
  { id: 'events', label: 'Events', short: 'Log' },
  { id: 'logs', label: 'Call Logs', short: 'Hist' },
  { id: 'ui', label: 'Bundled UI', short: 'UI' },
  { id: 'helpers', label: 'Helpers', short: 'Util' },
  { id: 'engine', label: 'Engine', short: 'Eng' },
];

function CredentialsGate({ onSubmit }: { onSubmit: (cfg: SipConfig) => void }) {
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [d, setD] = useState('');
  return (
    <ScrollView contentContainerStyle={styles.gateScroll}>
      <Text style={styles.gateTitle}>Call SDK · Test Harness</Text>
      <Text style={styles.gateSubtitle}>
        Enter SIP credentials to mount {'<CallProvider>'}. You can change them
        at any time from the Connection tab.
      </Text>
      <Section title="SIP Account">
        <Input label="Username" value={u} onChangeText={setU} placeholder="100" />
        <Input
          label="Password"
          value={p}
          onChangeText={setP}
          placeholder="••••••••"
          secureTextEntry
        />
        <Input
          label="Domain"
          value={d}
          onChangeText={setD}
          placeholder="sip.example.com[:5060]"
        />
        <Button
          title="Connect"
          variant="primary"
          onPress={() =>
            onSubmit({ username: u, password: p, domain: d, transport: 'tcp' })
          }
          disabled={!u || !d}
        />
      </Section>
      <Text style={styles.gateNote}>
        Tip: invalid creds are fine for exploring helpers and the bundled UI;
        registration will simply stay in "failed".
      </Text>
    </ScrollView>
  );
}

function StatusStrip() {
  const call = useCall();
  const log = useEventLog();
  const reg = call.registration?.state ?? 'idle';
  const regTone =
    reg === 'ok' ? 'ok' : reg === 'failed' ? 'err' : reg === 'progress' ? 'info' : 'neutral';
  return (
    <View style={styles.statusStrip}>
      <Row gap={space.sm}>
        <Pill label={`SIP: ${reg}`} tone={regTone as any} />
        <Pill label={call.callStatus || 'Idle'} tone="neutral" />
        {call.formattedDuration !== '0:00' ? (
          <Pill label={call.formattedDuration} tone="info" />
        ) : null}
      </Row>
      <Text style={styles.statusEvents}>{log.entries.length} events</Text>
    </View>
  );
}

function TabBar({
  activeTab,
  onChange,
}: {
  activeTab: TabId;
  onChange: (id: TabId) => void;
}) {
  const call = useCall();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabBar}
    >
      {TABS.map((t) => {
        const active = t.id === activeTab;
        const showDot =
          (t.id === 'call' &&
            (call.incoming || (call.callStatus !== 'Idle' && call.callStatus !== ''))) ||
          false;
        return (
          <TouchableOpacity
            key={t.id}
            onPress={() => onChange(t.id)}
            activeOpacity={0.7}
            style={[styles.tab, active && styles.tabActive]}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]}>
              {t.label}
            </Text>
            {showDot ? <View style={styles.tabDot} /> : null}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function Shell({
  config,
  onClearConfig,
  onApplyConfig,
}: {
  config: SipConfig | null;
  onClearConfig: () => void;
  onApplyConfig: (cfg: SipConfig) => void;
}) {
  const [activeTab, setActiveTab] = useState<TabId>('status');
  const call = useCall();
  const log = useEventLog();

  // Auto-jump to Active Call when a call appears, but only if user is not on
  // a screen they intentionally chose mid-call (Events or Dial).
  React.useEffect(() => {
    if (call.incoming && activeTab !== 'events' && activeTab !== 'engine') {
      setActiveTab('call');
    }
  }, [call.incoming]);

  return (
    <View style={styles.shell}>
      <StatusStrip />
      <TabBar activeTab={activeTab} onChange={setActiveTab} />
      <View style={styles.body}>
        {activeTab === 'status' && (
          <ConnectionScreen
            config={config}
            onApply={onApplyConfig}
            onClear={onClearConfig}
          />
        )}
        {activeTab === 'dial' && <DialerScreen />}
        {activeTab === 'call' && <ActiveCallScreen />}
        {activeTab === 'events' && <EventLogScreen />}
        {activeTab === 'logs' && <CallLogsScreen />}
        {activeTab === 'ui' && <UIPreviewScreen />}
        {activeTab === 'helpers' && <HelpersScreen />}
        {activeTab === 'engine' && <EngineScreen />}
      </View>
    </View>
  );
}

function ProviderHost({
  config,
  onClear,
  onApply,
}: {
  config: SipConfig;
  onClear: () => void;
  onApply: (cfg: SipConfig) => void;
}) {
  const log = useEventLog();
  return (
    <CallProvider
      config={config}
      onIncomingCall={(info) =>
        log.push('incoming', `onIncomingCall: ${info.name} (${info.phone})`, info)
      }
      onOutgoingCall={(info) =>
        log.push('outgoing', `onOutgoingCall: ${info.phone}`, info)
      }
      onCallStateChanged={(state) =>
        log.push('callState', `onCallStateChanged: ${state}`, { state })
      }
      onCallEnded={() => log.push('callEnded', 'onCallEnded')}
      onRegistrationStateChanged={(r) =>
        log.push('registration', `onRegistrationStateChanged: ${r.state}`, r)
      }
      onError={(e) => log.push('error', `onError: ${e.code} — ${e.message}`, e)}
    >
      <Shell config={config} onClearConfig={onClear} onApplyConfig={onApply} />
    </CallProvider>
  );
}

export default function App() {
  const [config, setConfig] = useState<SipConfig | null>(null);

  return (
    <EventLogProvider>
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor={theme.bg} />
        {config ? (
          <ProviderHost
            config={config}
            onClear={() => setConfig(null)}
            onApply={setConfig}
          />
        ) : (
          <CredentialsGate onSubmit={setConfig} />
        )}
      </SafeAreaView>
    </EventLogProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  shell: { flex: 1 },
  body: { flex: 1 },
  gateScroll: {
    padding: space.lg,
    paddingTop: space.xl,
    gap: space.md,
  },
  gateTitle: {
    color: theme.text,
    fontSize: 22,
    fontWeight: '800',
  },
  gateSubtitle: {
    color: theme.textDim,
    fontSize: 13,
    marginBottom: space.sm,
  },
  gateNote: {
    color: theme.textMuted,
    fontStyle: 'italic',
    fontSize: 12,
    marginTop: space.sm,
  },
  statusStrip: {
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusEvents: {
    color: theme.textMuted,
    fontSize: 11,
    fontFamily: 'Courier',
  },
  tabBar: {
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    gap: space.xs,
    backgroundColor: theme.bg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  tab: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  tabText: {
    color: theme.textDim,
    fontWeight: '600',
    fontSize: 13,
  },
  tabTextActive: {
    color: theme.text,
  },
  tabDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.ok,
  },
});
