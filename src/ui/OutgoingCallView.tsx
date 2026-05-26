/**
 * In-call screen used for both outgoing calls and after answering an incoming
 * call. Shows the caller, status, timer, and mute/speaker/end controls.
 *
 * Pure presentation — all state comes from `useCall()`.
 */
import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useCall } from '../CallProvider';
import { callStatusLabel, parseSipUser } from '../helpers';
import { Avatar } from './Avatar';
import { mergeTheme, type CallTheme } from './theme';

interface OutgoingCallViewProps {
  /** Caller name to display. Falls back to the SIP user-part. */
  name?: string;
  /** Phone number to display under the name. */
  phone?: string;
  /** Free-form location string (e.g. "Lagos, Nigeria"). Optional. */
  location?: string;
  /** Two-character avatar initials. */
  initials?: string;
  /** Called after hangup completes. Usually you `navigation.goBack()`. */
  onEnded?: () => void;
  /** Theme overrides. */
  theme?: Partial<CallTheme>;
  /** Optional top-of-screen element (e.g. a logo). */
  header?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function OutgoingCallView({
  name,
  phone,
  location,
  initials,
  onEnded,
  theme,
  header,
  style,
}: OutgoingCallViewProps) {
  const {
    callStatus,
    hangup,
    toggleMute,
    toggleSpeaker,
    formattedDuration,
    isMuted,
    isSpeaker,
  } = useCall();
  const t = mergeTheme(theme);

  const status = callStatusLabel(callStatus);
  const showTimer = ['In progress', 'On hold', 'Call ended'].includes(status);
  const ended = status === 'Call ended';

  const pretty = (s = '') => (s.includes('@') ? parseSipUser(s) : s);

  const handleEnd = async () => {
    if (!ended) await hangup();
    onEnded?.();
  };

  return (
    <View style={[styles.container, { backgroundColor: t.background }, style]}>
      {header}
      <Text style={[styles.status, ended && { color: t.decline }, !ended && { color: t.text }]}>
        {status}
      </Text>
      {showTimer && (
        <Text style={[styles.duration, { color: t.text }]}>{formattedDuration}</Text>
      )}

      <View style={styles.avatarWrap}>
        <Avatar
          initials={initials ?? (name || '??').slice(0, 2)}
          size={80}
          color={t.primary}
          background="#EEF2FF"
        />
      </View>

      {!!name && <Text style={[styles.name, { color: t.text }]}>{pretty(name)}</Text>}
      {!!phone && <Text style={[styles.phone, { color: t.text }]}>{pretty(phone)}</Text>}
      {!!location && (
        <Text style={[styles.location, { color: t.subtext }]}>{location}</Text>
      )}

      <View style={styles.controlsGrid}>
        <CallControl
          label={isMuted ? 'Unmute' : 'Mute'}
          icon="🎙"
          active={isMuted}
          disabled={ended}
          onPress={toggleMute}
          theme={t}
        />
        <CallControl
          label={isSpeaker ? 'Earpiece' : 'Speaker'}
          icon="🔊"
          active={isSpeaker}
          disabled={ended}
          onPress={toggleSpeaker}
          theme={t}
        />
        <View style={styles.controlPlaceholder} />
      </View>

      <TouchableOpacity
        style={[styles.endBtn, { backgroundColor: t.decline }]}
        onPress={handleEnd}
      >
        <Text style={{ color: '#fff', fontSize: 28 }}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

interface ControlProps {
  label: string;
  icon: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
  theme: CallTheme;
}

function CallControl({ label, icon, active, disabled, onPress, theme }: ControlProps) {
  const bg = active ? theme.controlOnBg : theme.controlOffBg;
  const iconColor = active
    ? theme.controlIconOn
    : disabled
    ? '#ccc'
    : theme.controlIconOff;
  return (
    <TouchableOpacity
      style={[styles.control, disabled && styles.controlDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <View style={[styles.controlCircle, { backgroundColor: bg }]}>
        <Text style={{ fontSize: 24, color: iconColor }}>{icon}</Text>
      </View>
      <Text style={[styles.controlLabel, disabled && { color: '#aaa' }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 60,
  },
  status: { fontSize: 15, marginBottom: 6, marginTop: 10 },
  duration: { fontSize: 16, fontWeight: '600', marginBottom: 10 },
  avatarWrap: { marginBottom: 10, marginTop: 15 },
  name: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  phone: { fontSize: 18, marginTop: 6, marginBottom: 6 },
  location: { fontSize: 15, marginBottom: 16 },
  controlsGrid: {
    width: '88%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignSelf: 'center',
    marginTop: 30,
    marginBottom: 18,
  },
  control: { width: '30%', alignItems: 'center', marginVertical: 16 },
  controlPlaceholder: { width: '30%' },
  controlDisabled: { opacity: 0.48 },
  controlCircle: {
    width: 65,
    height: 65,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 7,
  },
  controlLabel: { fontSize: 15, color: '#222', textAlign: 'center' },
  endBtn: {
    position: 'absolute',
    bottom: 60,
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
