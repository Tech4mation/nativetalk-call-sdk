import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import {
  destinationToSipUri,
  sanitizeDial,
  useCall,
} from '@nativetalk/react-native-call-sdk';
import { Dialer } from '@nativetalk/react-native-call-sdk/ui';

import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { KeyValue } from '../components/KeyValue';
import { Row } from '../components/Row';
import { Section } from '../components/Section';
import { useEventLog } from '../context/EventLog';
import { space } from '../theme';

export function DialerScreen() {
  const call = useCall();
  const log = useEventLog();
  const [showBundled, setShowBundled] = useState(false);
  const [dest, setDest] = useState('');

  const sanitized = useMemo(() => sanitizeDial(dest), [dest]);
  const sipUri = useMemo(
    () => destinationToSipUri(sanitized, call.config?.domain ?? ''),
    [sanitized, call.config?.domain]
  );

  const doDial = async () => {
    if (!sanitized) return;
    try {
      await call.dial(sanitized);
      log.push('outgoing', `dial("${sanitized}") → ${sipUri}`);
    } catch (e: any) {
      log.push('error', `dial() threw: ${e?.message ?? e}`);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Section
        title="Manual Dial"
        subtitle="Watch helpers normalise input before dialling"
      >
        <Input
          label="Destination"
          value={dest}
          onChangeText={setDest}
          placeholder="100, +2348012345678, or sip:x@gateway"
          keyboardType="default"
        />
        <KeyValue k="sanitizeDial()" v={sanitized || '—'} mono />
        <KeyValue k="destinationToSipUri()" v={sipUri || '—'} mono />
        <Row gap={space.sm}>
          <Button
            title="dial()"
            variant="primary"
            onPress={doDial}
            disabled={!sanitized}
          />
          <Button title="Clear" variant="ghost" onPress={() => setDest('')} />
        </Row>
      </Section>

      <Section
        title="Bundled <Dialer /> Component"
        subtitle="Exported from @nativetalk/react-native-call-sdk/ui"
      >
        <Button
          title={showBundled ? 'Hide bundled Dialer' : 'Show bundled Dialer'}
          onPress={() => setShowBundled((s) => !s)}
        />
        {showBundled ? <Dialer /> : null}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: space.lg,
    paddingBottom: 80,
  },
});
