import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { CallEngine, callEvents } from '@nativetalk/react-native-call-sdk';

import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Row } from '../components/Row';
import { Section } from '../components/Section';
import { useEventLog } from '../context/EventLog';
import { space, theme } from '../theme';

export function EngineScreen() {
  const log = useEventLog();
  const [voipToken, setVoipToken] = useState('');
  const [rawDest, setRawDest] = useState('');
  const [eventName, setEventName] = useState('RegistrationChanged');

  const wrap = (label: string, fn: () => void | Promise<unknown>) => async () => {
    try {
      const result = await fn();
      log.push('engine', label, result ?? undefined);
    } catch (e: any) {
      log.push('error', `${label} threw: ${e?.message ?? e}`);
    }
  };

  const subscribeAny = () => {
    const sub = callEvents.addListener(eventName, (payload: unknown) => {
      log.push('native', `[raw] ${eventName}`, payload);
    });
    log.push('engine', `Subscribed to raw "${eventName}" event`);
    setTimeout(() => {
      sub.remove();
      log.push('engine', `Unsubscribed from raw "${eventName}" (30s window)`);
    }, 30_000);
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Section
        title="CallEngine"
        subtitle="Escape-hatch direct calls to the native bridge. Prefer useCall()."
      >
        <Row gap={space.sm} wrap>
          <Button title="init()" onPress={wrap('CallEngine.init()', CallEngine.init)} />
          <Button
            title="getRegistrationStatus()"
            onPress={wrap('CallEngine.getRegistrationStatus()', CallEngine.getRegistrationStatus)}
          />
          <Button
            title="getCallLogs()"
            onPress={wrap('CallEngine.getCallLogs()', CallEngine.getCallLogs)}
          />
          <Button
            title="refreshRegisters()"
            onPress={wrap('CallEngine.refreshRegisters()', CallEngine.refreshRegisters)}
          />
          <Button
            title="setRegisterEnabled(true)"
            variant="ok"
            onPress={wrap('CallEngine.setRegisterEnabled(true)', () =>
              CallEngine.setRegisterEnabled(true)
            )}
          />
          <Button
            title="setRegisterEnabled(false)"
            variant="warn"
            onPress={wrap('CallEngine.setRegisterEnabled(false)', () =>
              CallEngine.setRegisterEnabled(false)
            )}
          />
          <Button
            title="ensureMicPermission()"
            onPress={wrap('CallEngine.ensureMicPermission()', CallEngine.ensureMicPermission)}
          />
        </Row>
      </Section>

      <Section title="Native Services (Android)">
        <Row gap={space.sm}>
          <Button
            title="startNativeServices()"
            variant="ok"
            onPress={wrap('CallEngine.startNativeServices()', () =>
              CallEngine.startNativeServices()
            )}
          />
          <Button
            title="stopNativeServices(false)"
            variant="warn"
            onPress={wrap('CallEngine.stopNativeServices(false)', () =>
              CallEngine.stopNativeServices(false)
            )}
          />
          <Button
            title="stopNativeServices(true)"
            variant="danger"
            onPress={wrap('CallEngine.stopNativeServices(true)', () =>
              CallEngine.stopNativeServices(true)
            )}
          />
        </Row>
        {Platform.OS !== 'android' ? (
          <Text style={styles.platformNote}>
            (Native service controls are no-ops on iOS.)
          </Text>
        ) : null}
      </Section>

      <Section title="iOS VoIP Push Token">
        <Input
          label="Hex token"
          value={voipToken}
          onChangeText={setVoipToken}
          placeholder="abcdef0123..."
        />
        <Button
          title="registerVoipToken()"
          onPress={wrap(`CallEngine.registerVoipToken("${voipToken.slice(0, 8)}…")`, () =>
            CallEngine.registerVoipToken(voipToken)
          )}
          disabled={!voipToken}
        />
        {Platform.OS !== 'ios' ? (
          <Text style={styles.platformNote}>
            (VoIP token registration is a no-op on Android.)
          </Text>
        ) : null}
      </Section>

      <Section
        title="Raw call() — bypass dial()"
        subtitle="Pass an already-formed SIP URI directly to the native bridge"
      >
        <Input
          label="SIP URI"
          value={rawDest}
          onChangeText={setRawDest}
          placeholder="sip:100@sip.example.com"
        />
        <Row gap={space.sm}>
          <Button
            title="call(uri)"
            variant="primary"
            disabled={!rawDest}
            onPress={wrap(`CallEngine.call("${rawDest}")`, () =>
              CallEngine.call(rawDest)
            )}
          />
          <Button title="end()" variant="danger" onPress={wrap('CallEngine.end()', CallEngine.end)} />
          <Button title="answer()" variant="ok" onPress={wrap('CallEngine.answer()', CallEngine.answer)} />
        </Row>
      </Section>

      <Section
        title="Raw event subscription"
        subtitle="Subscribes to NativeEventEmitter directly. Auto-removes after 30s."
      >
        <Input
          label="Event name"
          value={eventName}
          onChangeText={setEventName}
          placeholder="RegistrationChanged | CallIncoming | CallState | CallEnded | TMPhoneCallState | TMPhoneCallInfo"
        />
        <Button title="Subscribe (30s)" onPress={subscribeAny} disabled={!eventName} />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: space.lg,
    paddingBottom: 80,
  },
  platformNote: {
    color: theme.textMuted,
    fontStyle: 'italic',
    fontSize: 12,
  },
});
