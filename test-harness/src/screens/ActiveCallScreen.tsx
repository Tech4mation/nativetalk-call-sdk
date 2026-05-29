import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  callStatusLabel,
  useCall,
  type DeclineReason,
} from '@nativetalk/react-native-call-sdk';

import { Button } from '../components/Button';
import { KeyValue } from '../components/KeyValue';
import { Pill } from '../components/Pill';
import { Row } from '../components/Row';
import { Section } from '../components/Section';
import { useEventLog } from '../context/EventLog';
import { radius, space, theme } from '../theme';

const DTMF_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
const DECLINE_REASONS: DeclineReason[] = [
  'declined',
  'busy',
  'notacceptable',
  'temporarilyunavailable',
];

const callTone = (status: string, incoming: boolean) => {
  if (incoming) return 'info';
  switch (status) {
    case 'Connected':
    case 'StreamsRunning':
      return 'ok';
    case 'OutgoingProgress':
    case 'OutgoingRinging':
    case 'OutgoingEarlyMedia':
      return 'info';
    case 'Paused':
    case 'PausedByRemote':
    case 'Pausing':
      return 'warn';
    case 'Error':
      return 'err';
    case 'End':
    case 'Released':
      return 'neutral';
    default:
      return 'neutral';
  }
};

export function ActiveCallScreen() {
  const call = useCall();
  const log = useEventLog();
  const [showDtmf, setShowDtmf] = useState(false);

  const incoming = call.incoming;
  const status = call.callStatus;

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Section
        title="Call State"
        subtitle="Mirrored from Linphone via CallState events"
      >
        <Row gap={space.sm} wrap>
          <Pill
            label={status || 'Idle'}
            tone={callTone(status, incoming) as any}
          />
          <Pill label={callStatusLabel(status)} tone="neutral" />
          {incoming ? <Pill label="incoming" tone="info" /> : null}
          {call.isHeld ? <Pill label="held" tone="warn" /> : null}
        </Row>
        <KeyValue k="Duration" v={call.formattedDuration} mono />
        <KeyValue k="durationSec" v={call.durationSec.toFixed(1)} mono />
        <KeyValue k="incomingInfo.name" v={call.incomingInfo?.name} />
        <KeyValue k="incomingInfo.phone" v={call.incomingInfo?.phone} />
        <KeyValue k="incomingInfo.uri" v={call.incomingInfo?.uri} mono />
        <KeyValue k="incomingInfo.callId" v={call.incomingInfo?.callId} mono />
      </Section>

      {incoming ? (
        <Section title="Incoming — Answer or Decline">
          <Row gap={space.sm}>
            <Button
              title="answer()"
              variant="ok"
              onPress={async () => {
                await call.answer();
                log.push('app', 'answer()');
              }}
            />
            <Button
              title="hangup()"
              variant="danger"
              onPress={async () => {
                await call.hangup();
                log.push('app', 'hangup()');
              }}
            />
          </Row>
          <Text style={styles.subLabel}>decline(reason)</Text>
          <Row gap={space.sm} wrap>
            {DECLINE_REASONS.map((r) => (
              <Button
                key={r}
                title={r}
                small
                variant="warn"
                onPress={async () => {
                  await call.decline(r);
                  log.push('app', `decline("${r}")`);
                }}
              />
            ))}
          </Row>
        </Section>
      ) : null}

      <Section title="In-Call Controls">
        <Row gap={space.sm} wrap>
          <Button
            title={call.isMuted ? 'Unmute' : 'Mute'}
            variant={call.isMuted ? 'warn' : 'secondary'}
            onPress={() => {
              call.toggleMute();
              log.push('app', 'toggleMute()');
            }}
          />
          <Button
            title={call.isSpeaker ? 'Speaker On' : 'Speaker Off'}
            variant={call.isSpeaker ? 'primary' : 'secondary'}
            onPress={() => {
              call.toggleSpeaker();
              log.push('app', 'toggleSpeaker()');
            }}
          />
          <Button
            title={call.isHeld ? 'Resume' : 'Hold'}
            variant={call.isHeld ? 'primary' : 'secondary'}
            onPress={() => {
              call.toggleHold();
              log.push('app', 'toggleHold()');
            }}
          />
          <Button
            title="hangup()"
            variant="danger"
            onPress={async () => {
              await call.hangup();
              log.push('app', 'hangup()');
            }}
          />
        </Row>
      </Section>

      <Section
        title="DTMF / Tones"
        subtitle="sendDtmf() goes over the call · playKeyTone() plays locally"
      >
        <Button
          title={showDtmf ? 'Hide pad' : 'Show pad'}
          onPress={() => setShowDtmf((s) => !s)}
        />
        {showDtmf ? (
          <View>
            <View style={styles.padGrid}>
              {DTMF_KEYS.map((k) => (
                <View key={k} style={styles.padCell}>
                  <Button
                    title={k}
                    onPress={() => {
                      call.sendDtmf(k);
                      call.playKeyTone(k);
                      log.push('app', `sendDtmf("${k}") + playKeyTone()`);
                    }}
                  />
                </View>
              ))}
            </View>
            <Text style={styles.hint}>
              Tapping a key calls both sendDtmf() (in-band on the call) and
              playKeyTone() (local audio feedback).
            </Text>
          </View>
        ) : null}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: space.lg,
    paddingBottom: 80,
  },
  subLabel: {
    color: theme.textDim,
    fontSize: 12,
    fontWeight: '600',
    marginTop: space.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  padGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: space.md,
    gap: space.sm,
  },
  padCell: {
    width: '31%',
  },
  hint: {
    color: theme.textMuted,
    fontSize: 11,
    marginTop: space.sm,
    fontStyle: 'italic',
  },
});
