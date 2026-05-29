import React, { useMemo, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { Button } from '../components/Button';
import { Pill } from '../components/Pill';
import { Row } from '../components/Row';
import { Section } from '../components/Section';
import { useEventLog, type EventCategory, type LogEntry } from '../context/EventLog';
import { radius, space, theme } from '../theme';

const CATEGORIES: EventCategory[] = [
  'registration',
  'incoming',
  'outgoing',
  'callState',
  'callEnded',
  'error',
  'native',
  'engine',
  'app',
];

const toneFor = (c: EventCategory): any => {
  switch (c) {
    case 'error':
      return 'err';
    case 'registration':
      return 'info';
    case 'incoming':
    case 'outgoing':
      return 'ok';
    case 'callState':
      return 'info';
    case 'callEnded':
      return 'warn';
    default:
      return 'neutral';
  }
};

const fmtTs = (ts: number) => {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};

const serialise = (data: unknown): string | null => {
  if (data === undefined) return null;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
};

export function EventLogScreen() {
  const { entries, clear } = useEventLog();
  const [filters, setFilters] = useState<Set<EventCategory>>(new Set());

  const toggle = (c: EventCategory) => {
    setFilters((s) => {
      const next = new Set(s);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (filters.size === 0) return entries;
    return entries.filter((e) => filters.has(e.category));
  }, [entries, filters]);

  const exportLog = async () => {
    const text = entries
      .slice()
      .reverse()
      .map((e) => {
        const data = serialise(e.data);
        return `[${fmtTs(e.ts)}] ${e.category.padEnd(12)} ${e.message}${data ? `\n${data}` : ''}`;
      })
      .join('\n');
    try {
      await Share.share({ message: text || '(empty log)' });
    } catch {
      /* user dismissed */
    }
  };

  return (
    <View style={styles.root}>
      <Section
        title="Filters"
        subtitle="Active filters narrow the feed below. None = show all."
      >
        <Row gap={space.xs} wrap>
          {CATEGORIES.map((c) => (
            <Button
              key={c}
              title={c}
              small
              variant={filters.has(c) ? 'primary' : 'secondary'}
              onPress={() => toggle(c)}
            />
          ))}
        </Row>
        <Row gap={space.sm} style={{ marginTop: space.sm }}>
          <Button title={`Clear (${entries.length})`} variant="warn" onPress={clear} />
          <Button title="Share / Export" onPress={exportLog} />
        </Row>
      </Section>

      <ScrollView contentContainerStyle={styles.feed}>
        {filtered.length === 0 ? (
          <Text style={styles.empty}>
            No events yet. Trigger a registration or call to populate the log.
          </Text>
        ) : null}
        {filtered.map((e) => (
          <LogRow key={e.id} entry={e} />
        ))}
      </ScrollView>
    </View>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const [open, setOpen] = useState(false);
  const dataStr = serialise(entry.data);
  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.ts}>{fmtTs(entry.ts)}</Text>
        <Pill label={entry.category} tone={toneFor(entry.category)} />
      </View>
      <Text style={styles.msg} numberOfLines={open ? undefined : 3}>
        {entry.message}
      </Text>
      {dataStr ? (
        <View>
          {open ? <Text style={styles.code}>{dataStr}</Text> : null}
          <Text style={styles.toggle} onPress={() => setOpen((o) => !o)}>
            {open ? 'collapse' : 'expand payload'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  feed: {
    paddingHorizontal: space.lg,
    paddingBottom: 100,
    gap: space.sm,
  },
  empty: {
    color: theme.textDim,
    textAlign: 'center',
    marginTop: space.xl,
    fontStyle: 'italic',
  },
  row: {
    backgroundColor: theme.surface,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 4,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ts: {
    color: theme.textMuted,
    fontFamily: 'Courier',
    fontSize: 11,
  },
  msg: {
    color: theme.text,
    fontSize: 13,
  },
  code: {
    color: theme.textDim,
    fontFamily: 'Courier',
    fontSize: 11,
    backgroundColor: theme.bg,
    padding: space.sm,
    borderRadius: radius.sm,
    marginTop: 4,
  },
  toggle: {
    color: theme.info,
    fontSize: 11,
    marginTop: 4,
    textDecorationLine: 'underline',
  },
});
