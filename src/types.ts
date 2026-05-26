/**
 * Public types for the Nativetalk Call SDK.
 *
 * These describe the SIP account configuration, registration state, call
 * lifecycle events, and the shape of `useCall()` and `<CallProvider>`.
 */

/** Transport used for SIP signalling. Most providers support `tcp`; use `tls` for encrypted signalling. */
export type SipTransport = 'udp' | 'tcp' | 'tls';

/**
 * SIP account credentials.
 *
 * `domain` should be the SIP server hostname (and optionally `:port`). Do NOT
 * include `sip:` or `http(s)://` — the SDK strips those automatically, but it's
 * cleaner not to send them.
 */
export interface SipConfig {
  username: string;
  password: string;
  domain: string;
  transport?: SipTransport;
}

/** Registration lifecycle states reported by the underlying SIP stack. */
export type RegistrationState =
  | 'none'
  | 'progress'
  | 'ok'
  | 'cleared'
  | 'failed'
  | 'unknown';

/** Registration state event payload. */
export interface RegistrationEvent {
  state: RegistrationState;
  message?: string;
  username?: string;
  domain?: string;
  displayName?: string;
  /** Human-readable form of `state` (e.g. `"Ok"`, `"Failed"`). */
  pretty?: string;
}

/**
 * Linphone-derived call lifecycle states. Use the string forms in your UI.
 *
 * The numeric mapping is preserved internally for backwards compatibility with
 * raw Linphone state values, but `useCall().callStatus` always returns the
 * string form.
 */
export type CallState =
  | 'Idle'
  | 'IncomingReceived'
  | 'PushIncomingReceived'
  | 'OutgoingInit'
  | 'OutgoingProgress'
  | 'OutgoingRinging'
  | 'OutgoingEarlyMedia'
  | 'Connected'
  | 'StreamsRunning'
  | 'Pausing'
  | 'Paused'
  | 'Resuming'
  | 'Referred'
  | 'Error'
  | 'End'
  | 'PausedByRemote'
  | 'UpdatedByRemote'
  | 'IncomingEarlyMedia'
  | 'Updating'
  | 'Released'
  | 'EarlyUpdatedByRemote'
  | 'EarlyUpdating'
  | string;

/** Reason passed to `decline()`. Maps to standard SIP response codes. */
export type DeclineReason =
  | 'declined'
  | 'busy'
  | 'notacceptable'
  | 'temporarilyunavailable';

/** Information about an incoming call, surfaced via `useCall().incomingInfo`. */
export interface IncomingCallInfo {
  /** Best-effort display name: display-name → username → SIP user-part → `"Unknown"`. */
  name: string;
  /** Phone number or SIP identifier the call came from. */
  phone: string;
  /** Two-character initials for avatar placeholders. */
  initials: string;
  /** SIP call ID. May be missing on push-initiated calls before media flows. */
  callId?: string;
  /** Raw SIP URI of the remote party (`sip:user@domain`). */
  uri?: string;
}

/** A single call history entry, normalised across platforms. */
export interface CallLogEntry {
  id: number;
  /** ISO-8601 timestamp (UTC). */
  call_start: string;
  call_type: 'LOCAL' | 'DID' | 'STANDARD' | string;
  caller_id: string;
  call_direction: 'inbound' | 'outbound' | string;
  called_number: string;
  /** Platform-specific shape — Android returns `{ text, code }`, iOS returns a string. */
  disposition:
    | { text: string; code: number }
    | string;
  debit: string;
  /** `MM:SS` or `HH:MM:SS`. */
  duration: string;
  destination: string;
  sip_user: string;
  created_at: string;
  updated_at: string;
}

/** Optional callbacks the host app can supply to `<CallProvider>`. */
export interface CallProviderEvents {
  /** Fired when a new incoming call arrives. Use this to navigate to your incoming-call screen. */
  onIncomingCall?: (info: IncomingCallInfo) => void;
  /** Fired when an outgoing call has been initiated via `dial()`. */
  onOutgoingCall?: (info: { phone: string; initials: string }) => void;
  /** Fired when the active call ends (any reason). */
  onCallEnded?: () => void;
  /** Fired on every call state transition. */
  onCallStateChanged?: (state: CallState) => void;
  /** Fired on every registration state transition. */
  onRegistrationStateChanged?: (event: RegistrationEvent) => void;
  /** Fired when an error occurs (e.g. registration failure). */
  onError?: (error: { code: string; message: string }) => void;
}

/** Props for `<CallProvider>`. */
export interface CallProviderProps extends CallProviderEvents {
  children: React.ReactNode;
  /**
   * SIP credentials. Pass `null` or omit while you load them from your backend —
   * the SDK will idle until a valid config arrives.
   */
  config?: SipConfig | null;
  /**
   * If true (default), the SDK calls `register()` automatically whenever
   * `config` changes. Set to false if you want manual control via the
   * `register()` action.
   */
  autoRegister?: boolean;
  /**
   * If true (default on Android), the SDK starts the background/foreground
   * service so calls can still arrive when the app is backgrounded. Has no
   * effect on iOS — there CallKit + VoIP push handles backgrounding.
   */
  enableNativeServices?: boolean;
  /**
   * If true, the SDK requests `RECORD_AUDIO` permission on Android during
   * provider mount. Default true. Disable if you handle permissions yourself.
   */
  requestMicPermission?: boolean;
}

/** Public API returned by `useCall()`. */
export interface CallApi {
  // --- Config ---
  config: SipConfig | null;

  // --- State ---
  registration: RegistrationEvent | null;
  callStatus: CallState;
  durationSec: number;
  formattedDuration: string;
  incoming: boolean;
  incomingInfo: IncomingCallInfo | null;
  isMuted: boolean;
  isSpeaker: boolean;
  isHeld: boolean;

  // --- Controls ---
  dial: (destination: string) => Promise<void>;
  answer: () => Promise<void>;
  hangup: () => Promise<void>;
  decline: (reason?: DeclineReason) => Promise<void>;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  toggleHold: () => void;
  sendDtmf: (digit: string) => void;
  playKeyTone: (digit: string) => void;

  // --- Registration management ---
  register: (config?: SipConfig) => Promise<void>;
  refreshRegistration: () => Promise<void>;
  unregister: () => Promise<void>;

  // --- Call history ---
  getCallLogs: () => Promise<CallLogEntry[]>;
  getRegistrationStatus: () => Promise<RegistrationEvent>;

  // --- Lifecycle (Android only — no-ops on iOS) ---
  startNativeServices: () => void;
  stopNativeServices: (logout?: boolean) => void;
}
