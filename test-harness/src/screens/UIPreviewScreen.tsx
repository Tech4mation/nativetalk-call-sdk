import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Avatar,
  Dialer,
  IncomingCallView,
  OutgoingCallView,
} from '@nativetalk/react-native-call-sdk/ui';

import { Button } from '../components/Button';
import { Row } from '../components/Row';
import { Section } from '../components/Section';
import { radius, space, theme } from '../theme';

type Tab = 'dialer' | 'incoming' | 'outgoing' | 'avatar';

const TABS: { id: Tab; label: string }[] = [
  { id: 'dialer', label: 'Dialer' },
  { id: 'incoming', label: 'Incoming' },
  { id: 'outgoing', label: 'Outgoing' },
  { id: 'avatar', label: 'Avatar' },
];

export function UIPreviewScreen() {
  const [tab, setTab] = useState<Tab>('dialer');

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Section
        title="Bundled UI Components"
        subtitle="Imported from @nativetalk/react-native-call-sdk/ui"
      >
        <Row gap={space.xs} wrap>
          {TABS.map((t) => (
            <Button
              key={t.id}
              title={t.label}
              small
              variant={tab === t.id ? 'primary' : 'secondary'}
              onPress={() => setTab(t.id)}
            />
          ))}
        </Row>
      </Section>

      <View style={styles.preview}>
        {tab === 'dialer' && (
          <View style={styles.frame}>
            <Dialer />
          </View>
        )}
        {tab === 'incoming' && (
          <>
            <View style={[styles.frame, styles.fullScreenFrame]}>
              <IncomingCallView location="Test Harness" />
            </View>
            <Text style={styles.note}>
              Renders against the current useCall() state. Trigger a real
              incoming call from your PBX to populate caller details.
            </Text>
          </>
        )}
        {tab === 'outgoing' && (
          <>
            <View style={[styles.frame, styles.fullScreenFrame]}>
              <OutgoingCallView
                name="Test User"
                phone="+15555550100"
                initials="TU"
              />
            </View>
            <Text style={styles.note}>
              Renders against useCall() state. Place an outgoing call from the
              Dial tab to see live status, duration, and controls update.
            </Text>
          </>
        )}
        {tab === 'avatar' && (
          <View style={styles.frame}>
            <Row gap={space.md} wrap>
              <Avatar initials="AB" size={48} />
              <Avatar initials="CD" size={64} />
              <Avatar initials="EF" size={96} />
              <Avatar initials="GH" size={128} />
            </Row>
            <Text style={styles.note}>
              Avatar renders coloured initial placeholders — useful for
              IncomingCallView when no image is available.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: space.lg,
    paddingBottom: 80,
  },
  preview: {
    minHeight: 400,
  },
  frame: {
    backgroundColor: theme.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    padding: space.md,
    gap: space.md,
  },
  fullScreenFrame: {
    height: 600,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  note: {
    color: theme.textMuted,
    fontStyle: 'italic',
    fontSize: 12,
  },
});
