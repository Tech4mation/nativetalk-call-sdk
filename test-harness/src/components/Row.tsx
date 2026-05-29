import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { space } from '../theme';

export function Row({
  children,
  gap = space.sm,
  wrap,
  style,
}: {
  children: React.ReactNode;
  gap?: number;
  wrap?: boolean;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        styles.row,
        { gap },
        wrap && styles.wrap,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wrap: { flexWrap: 'wrap' },
});
