import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCall, type CallLogEntry } from '@nativetalk/react-native-call-sdk';

import { Button } from '../components/Button';
import { KeyValue } from '../components/KeyValue';
import { Pill } from '../components/Pill';
import { Row } from '../components/Row';
import { Section } from '../components/Section';
import { useEventLog } from '../context/EventLog';
import { radius, space, theme } from '../theme';

const dispositionLabel = (d: CallLogEntry['disposition']) => {
  if (typeof d === 'string') return d;
  if (d && typeof d === 'object') return `${d.text} (${d.code})`;
  return '—';
};

const directionTone = (d: string): any =>
  d === 'inbound' ? 'info' : d === 'outbound' ? 'ok' : 'neutral';

export function CallLogsScreen() {
  const call = useCall();
  const log = useEventLog();
  const [entries, setEntries] = useState<CallLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    setErr(null);
    try {
      const list = await call.getCallLogs();
      setEntries(list);
      log.push('app', `getCallLogs() → ${list.length} entries`);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setErr(msg);
      log.push('error', `getCallLogs() failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Section
        title="Call History"
        subtitle="Normalised across Android & iOS via getCallLogs()"
      >
        <Row gap={space.sm}>
          <Button
            title={`Fetch (${entries.length})`}
            variant="primary"
            onPress={fetchLogs}
            loading={loading}
          />
          <Button
            title="Clear local view"
            variant="ghost"
            onPress={() => setEntries([])}
          />
        </Row>
        {err ? (
          <Text style={styles.err}>{err}</Text>
        ) : null}
      </Section>

      {entries.length === 0 && !loading ? (
        <Text style={styles.empty}>
          No call logs loaded yet. Tap Fetch above.
        </Text>
      ) : null}

      {entries.map((e) => (
        <View key={e.id} style={styles.card}>
          <Row gap={space.sm}>
            <Pill label={e.call_direction} tone={directionTone(e.call_direction)} />
            <Pill label={e.call_type} tone="neutral" />
          </Row>
          <KeyValue k="called_number" v={e.called_number} mono />
          <KeyValue k="caller_id" v={e.caller_id} mono />
          <KeyValue k="destination" v={e.destination} mono />
          <KeyValue k="sip_user" v={e.sip_user} mono />
          <KeyValue k="duration" v={e.duration} />
          <KeyValue k="debit" v={e.debit} />
          <KeyValue k="disposition" v={dispositionLabel(e.disposition)} />
          <KeyValue k="call_start" v={e.call_start} mono />
          <KeyValue k="created_at" v={e.created_at} mono />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: space.lg,
    paddingBottom: 80,
  },
  empty: {
    color: theme.textDim,
    textAlign: 'center',
    marginTop: space.xl,
    fontStyle: 'italic',
  },
  err: {
    color: theme.err,
    fontFamily: 'Courier',
    fontSize: 12,
  },
  card: {
    backgroundColor: theme.surface,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 4,
  },
});
