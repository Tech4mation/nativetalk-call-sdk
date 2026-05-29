import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  useCall,
  type RegistrationState,
  type SipConfig,
  type SipTransport,
} from '@nativetalk/react-native-call-sdk';

import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { KeyValue } from '../components/KeyValue';
import { Pill } from '../components/Pill';
import { Row } from '../components/Row';
import { Section } from '../components/Section';
import { useEventLog } from '../context/EventLog';
import { space, theme } from '../theme';

const TRANSPORTS: SipTransport[] = ['udp', 'tcp', 'tls'];

interface Props {
  config: SipConfig | null;
  onApply: (cfg: SipConfig) => void;
  onClear: () => void;
}

const toneFor = (state: RegistrationState | undefined) => {
  switch (state) {
    case 'ok':
      return 'ok';
    case 'progress':
      return 'info';
    case 'failed':
      return 'err';
    case 'cleared':
      return 'warn';
    default:
      return 'neutral';
  }
};

export function ConnectionScreen({ config, onApply, onClear }: Props) {
  const call = useCall();
  const log = useEventLog();
  const [u, setU] = useState(config?.username ?? '');
  const [p, setP] = useState(config?.password ?? '');
  const [d, setD] = useState(config?.domain ?? '');
  const [t, setT] = useState<SipTransport>(config?.transport ?? 'tcp');
  const [polling, setPolling] = useState(false);

  const apply = () => {
    if (!u || !d) return;
    onApply({ username: u, password: p, domain: d, transport: t });
    log.push('app', 'Applied SIP config', { username: u, domain: d, transport: t });
  };

  const fetchStatus = async () => {
    setPolling(true);
    try {
      const r = await call.getRegistrationStatus();
      log.push('registration', `getRegistrationStatus → ${r.state}`, r);
    } catch (e: any) {
      log.push('error', `getRegistrationStatus failed: ${e?.message ?? e}`);
    } finally {
      setPolling(false);
    }
  };

  const reg = call.registration;

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Section
        title="SIP Account"
        subtitle="Credentials are passed to <CallProvider config={...}>"
      >
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
          hint="Note: http(s):// prefix and trailing / are stripped by formatTenantDomain()"
        />
        <View>
          <Text style={styles.label}>Transport</Text>
          <Row gap={space.sm}>
            {TRANSPORTS.map((tx) => (
              <Button
                key={tx}
                title={tx.toUpperCase()}
                variant={t === tx ? 'primary' : 'secondary'}
                small
                onPress={() => setT(tx)}
              />
            ))}
          </Row>
        </View>
        <Row gap={space.sm} style={{ marginTop: space.sm }}>
          <Button title="Apply / Reconnect" variant="primary" onPress={apply} />
          <Button title="Clear" variant="ghost" onPress={onClear} />
        </Row>
      </Section>

      <Section
        title="Registration State"
        subtitle="Live from CallProvider.registration + onRegistrationStateChanged"
      >
        <Row>
          <Pill
            label={reg?.state ? String(reg.state) : 'idle'}
            tone={toneFor(reg?.state as RegistrationState)}
          />
        </Row>
        <KeyValue k="State" v={reg?.state} />
        <KeyValue k="Pretty" v={reg?.pretty} />
        <KeyValue k="Username" v={reg?.username ?? config?.username} />
        <KeyValue k="Domain" v={reg?.domain ?? config?.domain} />
        <KeyValue k="Message" v={reg?.message} />
      </Section>

      <Section title="Registration Controls">
        <Row gap={space.sm} wrap>
          <Button
            title="register()"
            onPress={async () => {
              try {
                await call.register();
                log.push('app', 'called register()');
              } catch (e: any) {
                log.push('error', `register() failed: ${e?.message ?? e}`);
              }
            }}
          />
          <Button
            title="refreshRegistration()"
            onPress={async () => {
              try {
                await call.refreshRegistration();
                log.push('app', 'called refreshRegistration()');
              } catch (e: any) {
                log.push('error', `refreshRegistration() failed: ${e?.message ?? e}`);
              }
            }}
          />
          <Button
            title="unregister()"
            variant="warn"
            onPress={async () => {
              try {
                await call.unregister();
                log.push('app', 'called unregister()');
              } catch (e: any) {
                log.push('error', `unregister() failed: ${e?.message ?? e}`);
              }
            }}
          />
          <Button
            title="getRegistrationStatus()"
            loading={polling}
            onPress={fetchStatus}
          />
        </Row>
      </Section>

      <Section title="Android Native Services" subtitle="No-ops on iOS">
        <Row gap={space.sm}>
          <Button
            title="startNativeServices()"
            variant="ok"
            onPress={() => {
              call.startNativeServices();
              log.push('app', 'startNativeServices()');
            }}
          />
          <Button
            title="stopNativeServices(false)"
            variant="warn"
            onPress={() => {
              call.stopNativeServices(false);
              log.push('app', 'stopNativeServices(false)');
            }}
          />
          <Button
            title="stop(true) [logout]"
            variant="danger"
            onPress={() => {
              call.stopNativeServices(true);
              log.push('app', 'stopNativeServices(true)');
            }}
          />
        </Row>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: space.lg,
    paddingBottom: 80,
  },
  label: {
    color: theme.textDim,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: space.xs,
  },
});
