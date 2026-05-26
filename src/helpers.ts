/**
 * Pure helpers used by the provider and UI components.
 *
 * Kept here (not in `native.ts` or `CallProvider.tsx`) so they can be
 * unit-tested without touching React or native modules.
 */
import type { CallState, RegistrationState } from './types';

/** Strips `http(s)://` and trailing `/` from a tenant domain. */
export function formatTenantDomain(domain: string | undefined | null): string {
  if (!domain) return '';
  return domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

/** Extract the user-part of `sip:user@domain` (or returns the input unchanged). */
export function parseSipUser(sipUri: string = ''): string {
  const m = /sip:([^@;>]+)/i.exec(sipUri);
  return m?.[1] ?? sipUri.replace(/^sip:/i, '');
}

/** Sanitize a string to only digits, `+`, `#`, `*`. */
export function sanitizeDial(input: string = ''): string {
  return input.replace(/[^\d+#*]/g, '');
}

/** Format seconds as `M:SS` or `H:MM:SS`. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Convert two-character initials for avatar placeholders. */
export function initialsFrom(name: string | undefined | null): string {
  return (name || '??').slice(0, 2).toUpperCase();
}

/**
 * Linphone numeric-state → string-state mapping. The SDK's native modules emit
 * states as strings (e.g. `"Connected"`), but historical/raw integrations may
 * still send numeric codes, so we accept both.
 */
const CALL_STATE_BY_INT: Record<number, CallState> = {
  0: 'Idle',
  1: 'IncomingReceived',
  2: 'PushIncomingReceived',
  3: 'OutgoingInit',
  4: 'OutgoingProgress',
  5: 'OutgoingRinging',
  6: 'OutgoingEarlyMedia',
  7: 'Connected',
  8: 'StreamsRunning',
  9: 'Pausing',
  10: 'Paused',
  11: 'Resuming',
  12: 'Referred',
  13: 'Error',
  14: 'End',
  15: 'PausedByRemote',
  16: 'UpdatedByRemote',
  17: 'IncomingEarlyMedia',
  18: 'Updating',
  19: 'Released',
  20: 'EarlyUpdatedByRemote',
  21: 'EarlyUpdating',
};

const REG_STATE_BY_INT: Record<number, RegistrationState> = {
  0: 'none',
  1: 'progress',
  2: 'ok',
  3: 'cleared',
  4: 'failed',
};

/** Normalise a raw call-state value (string or int) to its canonical string form. */
export function callStateName(raw: unknown): CallState {
  if (typeof raw === 'number') return CALL_STATE_BY_INT[raw] ?? String(raw);
  return String(raw ?? '') as CallState;
}

/** Normalise a raw registration-state value (string or int) to canonical lowercase string. */
export function regStateName(raw: unknown): RegistrationState {
  if (typeof raw === 'number') {
    return REG_STATE_BY_INT[raw] ?? 'unknown';
  }
  const s = String(raw ?? '').toLowerCase();
  if (
    s === 'none' ||
    s === 'progress' ||
    s === 'ok' ||
    s === 'cleared' ||
    s === 'failed'
  ) {
    return s as RegistrationState;
  }
  return 'unknown';
}

/**
 * Map a raw call status to a user-friendly UI label.
 *
 * You typically don't need to call this directly — `useCall().callStatus`
 * already returns the canonical state name, and the bundled
 * `<OutgoingCallView>` does its own mapping. Use this when building a custom UI.
 */
export function callStatusLabel(status: CallState): string {
  switch (status) {
    case 'OutgoingInit':
    case 'OutgoingProgress':
    case 'OutgoingEarlyMedia':
      return 'Calling…';
    case 'OutgoingRinging':
      return 'Ringing…';
    case 'Connected':
    case 'StreamsRunning':
      return 'In progress';
    case 'Pausing':
      return 'Pausing…';
    case 'Paused':
    case 'PausedByRemote':
      return 'On hold';
    case 'Resuming':
      return 'Resuming…';
    case 'End':
    case 'Released':
      return 'Call ended';
    case 'Error':
      return 'Call failed';
    case 'IncomingReceived':
    case 'PushIncomingReceived':
    case 'IncomingEarlyMedia':
      return 'Incoming call';
    default:
      return status || 'Idle';
  }
}

/**
 * Resolve a destination string to a SIP URI.
 *
 * - `100` + `domain=sip.example.com` → `sip:100@sip.example.com`
 * - `sip:100@sip.example.com` → unchanged
 * - `100@sip.example.com` → `sip:100@sip.example.com`
 */
export function destinationToSipUri(
  destination: string,
  domain: string
): string {
  if (!destination) return '';
  if (destination.startsWith('sip:')) return destination;
  if (destination.includes('@')) return `sip:${destination}`;
  return `sip:${destination}@${formatTenantDomain(domain)}`;
}
