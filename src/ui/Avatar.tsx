import React from 'react';
import { Text, View, StyleSheet, ViewStyle, TextStyle } from 'react-native';

interface AvatarProps {
  initials: string;
  size?: number;
  background?: string;
  color?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

/** Tiny initials-circle used by the bundled call screens. */
export function Avatar({
  initials,
  size = 80,
  background = '#EEF2FF',
  color = '#2D6BFF',
  style,
  textStyle,
}: AvatarProps) {
  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: background },
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          { color, fontSize: Math.floor(size * 0.4) },
          textStyle,
        ]}
      >
        {(initials || '??').slice(0, 2).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  text: { fontWeight: '700' },
});
