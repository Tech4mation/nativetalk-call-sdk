import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { radius, space, theme } from '../theme';

type Tone = 'neutral' | 'ok' | 'warn' | 'err' | 'info';

const toneColor = (t: Tone) => {
  switch (t) {
    case 'ok':
      return theme.ok;
    case 'warn':
      return theme.warn;
    case 'err':
      return theme.err;
    case 'info':
      return theme.info;
    default:
      return theme.textDim;
  }
};

export function Pill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: Tone;
}) {
  const c = toneColor(tone);
  return (
    <View style={[styles.pill, { borderColor: c }]}>
      <View style={[styles.dot, { backgroundColor: c }]} />
      <Text style={[styles.txt, { color: c }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: theme.pillBg,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  txt: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
