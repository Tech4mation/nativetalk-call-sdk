/**
 * Thin bridge to the native `NativetalkCallSdk` module.
 *
 * This file is the only place that talks to `NativeModules` and the event
 * emitter. Everything else in the SDK uses these exports so the JS layer
 * stays testable.
 *
 * If you see "TurboModuleRegistry … was not found" at runtime, the native
 * library isn't linked. See `docs/installation.md`.
 */
import {
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import type { CallLogEntry, RegistrationEvent, SipTransport } from './types';

const LINKING_ERROR =
  `The package '@nativetalk/react-native-call-sdk' doesn't seem to be linked. Make sure:\n\n` +
  `- you rebuilt the app after installing the package\n` +
  `- you are not using Expo Go (use a dev client or bare workflow)\n` +
  `- (iOS) you ran 'pod install' inside the ios/ directory\n`;

// Proxy fallback: if autolinking failed, every method access throws a helpful
// error instead of a cryptic "undefined is not a function". This means a
// misconfigured app crashes EARLY with a clear message, not deep inside JS.
const NativetalkCallSdk =
  NativeModules.NativetalkCallSdk ??
  new Proxy(
    {},
    {
      get() {
        throw new Error(LINKING_ERROR);
      },
    }
  );

// Single shared emitter — re-creating it per subscription wastes native
// handlers and can drop events during the swap.
export const callEvents = new NativeEventEmitter(
  NativetalkCallSdk as unknown as Parameters<typeof NativeEventEmitter>[0]
);

/** Request microphone permission on Android. Returns true if granted (or platform is iOS). */
export async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    {
      title: 'Microphone Permission',
      message: 'Microphone access is required to make and receive calls.',
      buttonPositive: 'OK',
    }
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

// --- Core lifecycle ---

// Idempotent on the native side, safe to call multiple times.
export function init(cfg?: Record<string, unknown>): Promise<void> {
  return NativetalkCallSdk.init(cfg ?? {});
}

// Android-only: iOS uses CallKit + VoIP push instead of a background
// service. Guarding here keeps the JS API symmetric across platforms.
export function startNativeServices(): void {
  if (Platform.OS !== 'android') return;
  NativetalkCallSdk.startNativeServices();
}

export function stopNativeServices(logout = false): void {
  if (Platform.OS !== 'android') return;
  NativetalkCallSdk.stopNativeServices(logout);
}

// --- Registration ---

export interface RegisterArgs {
  username: string;
  password: string;
  domain: string;
  transport?: SipTransport;
}

export function register(account: RegisterArgs): void {
  NativetalkCallSdk.register(account);
}

// Optional-chained: older native builds may not export this method, and
// we'd rather no-op than crash on a non-critical refresh.
export function refreshRegisters(): void {
  NativetalkCallSdk.refreshRegisters?.();
}

export function setRegisterEnabled(enabled: boolean): void {
  NativetalkCallSdk.setRegisterEnabled(enabled);
}

export function getRegistrationStatus(): Promise<RegistrationEvent> {
  return NativetalkCallSdk.getRegistrationStatus();
}

// --- Call control ---

export function call(sipUri: string): void {
  NativetalkCallSdk.call(sipUri);
}

export function answer(): void {
  NativetalkCallSdk.answer();
}

export function end(): void {
  NativetalkCallSdk.end();
}

export function decline(reason: string = 'declined'): void {
  NativetalkCallSdk.decline?.(reason);
}

export function mute(on: boolean): void {
  NativetalkCallSdk.mute(on);
}

export function speaker(on: boolean): void {
  NativetalkCallSdk.speaker(on);
}

export function hold(): void {
  NativetalkCallSdk.hold();
}

export function resume(): void {
  NativetalkCallSdk.resume();
}

export function sendDtmf(digit: string): void {
  NativetalkCallSdk.sendDtmf(digit);
}

export function playKeyTone(digit: string): void {
  NativetalkCallSdk.playKeyTone(digit);
}

// --- Call logs ---

export function getCallLogs(): Promise<CallLogEntry[]> {
  return NativetalkCallSdk.getCallLogs();
}

// --- iOS push token (advanced; only used if you wire VoIP push manually) ---

// Call from the host AppDelegate's PushKit `didUpdate` handler so the token
// gets attached to the SIP account params. Android FCM uses a different flow.
export function registerVoipToken(hex: string): void {
  if (Platform.OS !== 'ios') return;
  NativetalkCallSdk.registerVoipToken?.(hex);
}

// --- Event subscriptions ---
//
// Typed wrappers around `callEvents.addListener` — using string-typed event
// names directly would lose autocomplete and let typos slip through. The
// `Sub` return shape mirrors NativeEventEmitter's so consumers can call
// `.remove()` without importing RN types.
type Listener<T> = (event: T) => void;
type Sub = { remove: () => void };

export const on = {
  RegistrationChanged: (cb: Listener<any>): Sub =>
    callEvents.addListener('RegistrationChanged', cb),
  CallIncoming: (cb: Listener<any>): Sub =>
    callEvents.addListener('CallIncoming', cb),
  CallState: (cb: Listener<any>): Sub =>
    callEvents.addListener('CallState', cb),
  CallEnded: (cb: Listener<any>): Sub =>
    callEvents.addListener('CallEnded', cb),
  // The TM* events are Android-only (telephony observer for native GSM
  // calls). They never fire on iOS but the subscription is harmless.
  TMPhoneCallState: (cb: Listener<any>): Sub =>
    callEvents.addListener('TMPhoneCallState', cb),
  TMPhoneCallInfo: (cb: Listener<any>): Sub =>
    callEvents.addListener('TMPhoneCallInfo', cb),
};
