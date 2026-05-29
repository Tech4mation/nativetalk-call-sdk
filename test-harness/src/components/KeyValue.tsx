import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { space, theme } from '../theme';

export function KeyValue({
  k,
  v,
  mono,
}: {
  k: string;
  v: string | number | null | undefined;
  mono?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.k}>{k}</Text>
      <Text style={[styles.v, mono && styles.mono]} numberOfLines={2}>
        {v == null || v === '' ? '—' : String(v)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.md,
    paddingVertical: 2,
  },
  k: {
    color: theme.textDim,
    fontSize: 13,
    flexShrink: 0,
  },
  v: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  mono: {
    fontFamily: 'Courier',
    fontSize: 12,
  },
});
