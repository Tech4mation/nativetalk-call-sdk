/**
 * Bundled dial-pad component.
 *
 * Drop it anywhere inside a `<CallProvider>` and it'll dial through the SDK.
 * Override almost everything via props if you want to keep the layout but
 * change the look.
 */
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';

import { useCall } from '../CallProvider';
import { sanitizeDial } from '../helpers';
import { mergeTheme, type CallTheme } from './theme';

interface DialerProps {
  /** Initial value of the input. */
  initialValue?: string;
  /** Called whenever the user submits a number (presses the call button or hits return). */
  onDialed?: (number: string) => void;
  /** Header rendered above the input. Pass `null` to hide. */
  header?: React.ReactNode | null;
  /** Custom call button. Receives an `onPress` and the current number. */
  renderCallButton?: (props: {
    onPress: () => void;
    disabled: boolean;
    number: string;
  }) => React.ReactNode;
  /** Theme overrides. */
  theme?: Partial<CallTheme>;
  /** If true (default) the dial-pad plays a DTMF UI tone on each key press. */
  playKeyTones?: boolean;
}

const dialPad: Array<Array<{ number: string; letters: string }>> = [
  [
    { number: '1', letters: '' },
    { number: '2', letters: 'ABC' },
    { number: '3', letters: 'DEF' },
  ],
  [
    { number: '4', letters: 'GHI' },
    { number: '5', letters: 'JKL' },
    { number: '6', letters: 'MNO' },
  ],
  [
    { number: '7', letters: 'PQRS' },
    { number: '8', letters: 'TUV' },
    { number: '9', letters: 'WXYZ' },
  ],
  [
    { number: '*', letters: '' },
    { number: '0', letters: '+' },
    { number: '#', letters: '' },
  ],
];

export function Dialer({
  initialValue = '',
  onDialed,
  header,
  renderCallButton,
  theme,
  playKeyTones = true,
}: DialerProps) {
  const [input, setInput] = useState(initialValue);
  const { dial, playKeyTone } = useCall();
  const { width, height } = useWindowDimensions();
  const isCompact = height < 760;
  const buttonSize = Math.min(width / 4.3, isCompact ? 68 : 84);
  const t = mergeTheme(theme);

  const handlePress = (value: string) => {
    if (playKeyTones) playKeyTone(value);
    setInput((prev) => prev + value);
  };

  const handleBackspace = () => setInput((prev) => prev.slice(0, -1));

  const handleCall = async () => {
    if (!input) return;
    try {
      await dial(input);
      onDialed?.(input);
    } catch (err: any) {
      // Errors surface via <CallProvider onError>. Swallow here so the dialer
      // doesn't crash the host app.
    }
  };

  const callDisabled = input.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: t.background }]}>
      {header}
      <View style={styles.inputContainer}>
        <TextInput
          value={input}
          placeholder="Enter Number"
          placeholderTextColor="#ccc"
          onChangeText={(s) => setInput(sanitizeDial(s))}
          keyboardType="phone-pad"
          inputMode="tel"
          autoCorrect={false}
          autoCapitalize="none"
          maxLength={64}
          style={[styles.inputText, { color: t.text }]}
          returnKeyType="done"
          onSubmitEditing={handleCall}
        />
        {input.length > 0 && (
          <TouchableOpacity style={styles.clearButton} onPress={handleBackspace}>
            <Text style={{ fontSize: 22, color: '#999' }}>⌫</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.padContainer}
        contentContainerStyle={[
          styles.padContent,
          { paddingTop: isCompact ? 16 : 30, paddingBottom: 24 },
        ]}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        {dialPad.map((row, i) => (
          <View
            style={[styles.padRow, { marginBottom: isCompact ? 8 : 10 }]}
            key={i}
          >
            {row.map((item) => (
              <TouchableOpacity
                key={item.number}
                style={[
                  styles.padButton,
                  {
                    width: buttonSize,
                    height: buttonSize,
                    borderRadius: buttonSize / 2,
                    marginHorizontal: isCompact ? 6 : 8,
                  },
                ]}
                onPress={() => handlePress(item.number)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.padNumber,
                    { fontSize: isCompact ? 28 : 30, color: t.text },
                  ]}
                >
                  {item.number}
                </Text>
                {!!item.letters && (
                  <Text style={[styles.padLetters, { color: t.subtext }]}>
                    {item.letters}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        ))}

        <View style={{ marginTop: isCompact ? 10 : 15 }}>
          {renderCallButton ? (
            renderCallButton({
              onPress: handleCall,
              disabled: callDisabled,
              number: input,
            })
          ) : (
            <TouchableOpacity
              onPress={handleCall}
              disabled={callDisabled}
              style={[
                styles.callButton,
                {
                  backgroundColor: callDisabled ? '#ccc' : t.answer,
                  width: isCompact ? 62 : 70,
                  height: isCompact ? 62 : 70,
                  borderRadius: (isCompact ? 62 : 70) / 2,
                },
              ]}
            >
              <Text style={{ color: '#fff', fontSize: 28 }}>📞</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
    marginTop: 10,
    marginBottom: 10,
    paddingHorizontal: 30,
    position: 'relative',
  },
  inputText: {
    flex: 1,
    fontSize: 26,
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: 2,
    paddingVertical: 12,
  },
  clearButton: {
    position: 'absolute',
    right: 35,
    padding: 6,
    zIndex: 10,
  },
  padContainer: {
    flex: 1,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  padContent: { alignItems: 'center' },
  padRow: { flexDirection: 'row', justifyContent: 'center' },
  padButton: {
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 1.5,
  },
  padNumber: { fontWeight: '600', textAlign: 'center' },
  padLetters: { fontSize: 11, letterSpacing: 2, textAlign: 'center', marginTop: 2 },
  callButton: { alignItems: 'center', justifyContent: 'center' },
});
