import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { radius, space, theme } from '../theme';

interface Props {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  style?: ViewStyle;
}

export function Section({ title, subtitle, children, style }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: theme.surface,
    borderRadius: radius.md,
    padding: space.lg,
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  title: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  subtitle: {
    color: theme.textDim,
    fontSize: 12,
    marginTop: 2,
  },
  body: {
    marginTop: space.md,
    gap: space.sm,
  },
});
