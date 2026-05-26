/**
 * Drop-in screen rendered when an incoming call is ringing.
 *
 * Wire-up:
 *
 * ```tsx
 * <CallProvider
 *   onIncomingCall={() => navigation.navigate('IncomingCall')}
 *   config={cfg}
 * >
 *   …
 * </CallProvider>
 *
 * // your IncomingCall screen:
 * <IncomingCallView onAnswered={() => navigation.replace('InCall')} />
 * ```
 */
import React, { useEffect } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useCall } from '../CallProvider';
import { parseSipUser } from '../helpers';
import { Avatar } from './Avatar';
import { mergeTheme, type CallTheme } from './theme';

interface IncomingCallViewProps {
  /** Called once `answer()` resolves — typically you navigate to the in-call screen here. */
  onAnswered?: () => void;
  /** Called after `decline()` completes. */
  onDeclined?: () => void;
  /** Called when there's no live incoming call (e.g. caller hung up first). */
  onDismissed?: () => void;
  /** Override the location string under the caller name. */
  location?: string;
  /** Custom title — defaults to "Incoming call". */
  title?: string;
  /** Theme overrides. */
  theme?: Partial<CallTheme>;
  /** Optional top-of-screen element (e.g. a logo). */
  header?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function IncomingCallView({
  onAnswered,
  onDeclined,
  onDismissed,
  location,
  title = 'Incoming call',
  theme,
  header,
  style,
}: IncomingCallViewProps) {
  const { incoming, incomingInfo, answer, decline } = useCall();
  const t = mergeTheme(theme);

  // Auto-dismiss if the call ends while this screen is mounted.
  useEffect(() => {
    if (!incoming) onDismissed?.();
  }, [incoming, onDismissed]);

  const pretty = (s = '') =>
    s.includes('@') ? parseSipUser(s) : s;

  const name = incomingInfo?.name ?? 'Unknown';
  const phone = incomingInfo?.phone ?? '';
  const initials = incomingInfo?.initials ?? '??';

  const onAnswer = async () => {
    await answer();
    onAnswered?.();
  };

  const onDecline = async () => {
    await decline('busy');
    onDeclined?.();
  };

  return (
    <View style={[styles.container, { backgroundColor: t.background }, style]}>
      {header}
      <Text style={[styles.status, { color: t.text }]}>{title}</Text>

      <View style={styles.avatarWrap}>
        <Avatar
          initials={initials}
          size={80}
          color={t.primary}
          background="#EEF2FF"
        />
      </View>

      <Text style={[styles.name, { color: t.text }]}>{pretty(name)}</Text>
      <Text style={[styles.phone, { color: t.text }]}>{pretty(phone)}</Text>
      {!!location && (
        <Text style={[styles.location, { color: t.subtext }]}>{location}</Text>
      )}

      <View style={styles.bottomRow}>
        <TouchableOpacity
          onPress={onDecline}
          activeOpacity={0.85}
          style={[styles.circleBtn, { backgroundColor: t.decline }]}
        >
          <Text style={styles.circleIcon}>✕</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onAnswer}
          activeOpacity={0.85}
          style={[styles.circleBtn, { backgroundColor: t.answer }]}
        >
          <Text style={styles.circleIcon}>📞</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 60,
  },
  status: { fontSize: 18, marginBottom: 16, marginTop: 8 },
  avatarWrap: { marginBottom: 22, marginTop: 6 },
  name: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
  phone: { fontSize: 18, marginTop: 8 },
  location: { fontSize: 16, marginTop: 8 },
  bottomRow: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
  },
  circleBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  circleIcon: { fontSize: 32, color: '#fff' },
});
