import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import {
  callStateName,
  callStatusLabel,
  destinationToSipUri,
  formatDuration,
  formatTenantDomain,
  initialsFrom,
  parseSipUser,
  regStateName,
  sanitizeDial,
} from '@nativetalk/react-native-call-sdk';

import { Input } from '../components/Input';
import { KeyValue } from '../components/KeyValue';
import { Section } from '../components/Section';
import { space } from '../theme';

export function HelpersScreen() {
  const [domain, setDomain] = useState('https://t1.example.com/');
  const [sip, setSip] = useState('sip:100@gw.example.com;transport=tcp');
  const [dial, setDial] = useState('+1 (555) 010-0000 ext.42');
  const [name, setName] = useState('Jane Doe');
  const [dur, setDur] = useState('3725');
  const [destDom, setDestDom] = useState('sip.example.com');
  const [dest, setDest] = useState('100');
  const [rawState, setRawState] = useState('7');
  const [rawReg, setRawReg] = useState('OK');
  const [statusName, setStatusName] = useState('StreamsRunning');

  const durNum = useMemo(() => Number(dur) || 0, [dur]);

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Section title="formatTenantDomain(domain)">
        <Input value={domain} onChangeText={setDomain} placeholder="https://..." />
        <KeyValue k="→" v={formatTenantDomain(domain)} mono />
      </Section>

      <Section title="parseSipUser(uri)">
        <Input value={sip} onChangeText={setSip} placeholder="sip:user@domain" />
        <KeyValue k="→" v={parseSipUser(sip)} mono />
      </Section>

      <Section title="sanitizeDial(input)">
        <Input value={dial} onChangeText={setDial} placeholder="any input" />
        <KeyValue k="→" v={sanitizeDial(dial)} mono />
      </Section>

      <Section title="initialsFrom(name)">
        <Input value={name} onChangeText={setName} />
        <KeyValue k="→" v={initialsFrom(name)} mono />
      </Section>

      <Section title="formatDuration(seconds)">
        <Input value={dur} onChangeText={setDur} keyboardType="numeric" />
        <KeyValue k="→" v={formatDuration(durNum)} mono />
      </Section>

      <Section title="destinationToSipUri(destination, domain)">
        <Input
          value={dest}
          onChangeText={setDest}
          placeholder="100, user@gw, or sip:..."
        />
        <Input value={destDom} onChangeText={setDestDom} placeholder="sip.example.com" />
        <KeyValue k="→" v={destinationToSipUri(dest, destDom)} mono />
      </Section>

      <Section title="callStateName(raw)" subtitle="Accepts ints or strings">
        <Input value={rawState} onChangeText={setRawState} />
        <KeyValue
          k="→"
          v={callStateName(isNaN(Number(rawState)) ? rawState : Number(rawState))}
          mono
        />
      </Section>

      <Section title="regStateName(raw)" subtitle="Accepts ints or strings">
        <Input value={rawReg} onChangeText={setRawReg} />
        <KeyValue
          k="→"
          v={regStateName(isNaN(Number(rawReg)) ? rawReg : Number(rawReg))}
          mono
        />
      </Section>

      <Section title="callStatusLabel(state)">
        <Input value={statusName} onChangeText={setStatusName} />
        <KeyValue k="→" v={callStatusLabel(statusName)} mono />
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
