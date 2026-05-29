import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { radius, space, theme } from '../theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ok' | 'warn' | 'ghost';

interface Props {
  title: string;
  onPress: () => void | Promise<void>;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: ViewStyle;
}

const colorFor = (v: Variant) => {
  switch (v) {
    case 'primary':
      return theme.accent;
    case 'danger':
      return theme.err;
    case 'ok':
      return theme.ok;
    case 'warn':
      return theme.warn;
    case 'ghost':
      return 'transparent';
    case 'secondary':
    default:
      return theme.surfaceAlt;
  }
};

export function Button({
  title,
  onPress,
  variant = 'secondary',
  disabled,
  loading,
  small,
  style,
}: Props) {
  const bg = colorFor(variant);
  const isGhost = variant === 'ghost';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      style={[
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: bg, borderColor: isGhost ? theme.border : bg },
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme.text} />
      ) : (
        <Text style={[styles.txt, small && styles.txtSmall]} numberOfLines={1}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    minHeight: 44,
  },
  btnSmall: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    minHeight: 32,
  },
  txt: {
    color: theme.text,
    fontWeight: '700',
    fontSize: 14,
  },
  txtSmall: {
    fontSize: 12,
  },
  disabled: {
    opacity: 0.5,
  },
});
