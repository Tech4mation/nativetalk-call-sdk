/**
 * <CallProvider> — the single React component the host app mounts to enable
 * calling. It wires the native event stream into React state and exposes
 * everything through `useCall()`.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  Mental model
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   Linphone Core  ──events──►  Native module  ──RN bridge──►  CallProvider
 *        ▲                                                          │
 *        │                                                          ▼
 *        └────── method calls (dial/answer/end) ────────────  useCall() hook
 *
 *  - The Linphone `Core` is the single source of truth for "what state is the
 *    call in". CallProvider just mirrors that state into React.
 *  - Provider → native flows via plain method calls. Native → provider flows
 *    via NativeEventEmitter events (RegistrationChanged, CallIncoming, etc.).
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  Design rules
 * ──────────────────────────────────────────────────────────────────────────
 *  - No coupling to auth, navigation, or any specific HTTP client. SIP config
 *    is passed in as a prop; lifecycle events (incoming, ended) are exposed as
 *    callbacks so the host app decides how to navigate / display screens.
 *  - Safe to mount with `config={null}` while you fetch credentials — the SDK
 *    simply idles until a real config arrives, then auto-registers (unless
 *    `autoRegister={false}`).
 *  - All event callbacks are read through refs (see `*Ref` block) so the host
 *    app can pass fresh closures on every render WITHOUT re-subscribing the
 *    native events — that would drop in-flight calls during a re-render.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';

import {
  callStateName,
  callStatusLabel,
  destinationToSipUri,
  formatDuration,
  formatTenantDomain,
  initialsFrom,
  parseSipUser,
  regStateName,
} from './helpers';
import * as Native from './native';
import type {
  CallApi,
  CallLogEntry,
  CallProviderProps,
  CallState,
  DeclineReason,
  IncomingCallInfo,
  RegistrationEvent,
  SipConfig,
} from './types';

const CallContext = createContext<CallApi | null>(null);

// ── State-group lookups for the call lifecycle FSM ────────────────────────
//
// Linphone exposes ~20 fine-grained call states. The UI only cares about a
// handful of behavioural buckets, so we precompute them here and look them
// up in O(1) inside the CallState event handler.
//
//   ACTIVE   → audio is flowing; start the duration timer
//   TERMINAL → call is gone; freeze the timer & reset audio toggles
//   HELD     → on hold (initiated by us OR by the remote peer)
//   RESUMED  → coming out of hold OR media flowing again
//
// Note: `Connected` and `StreamsRunning` appear in BOTH active and resumed —
// they're listed twice on purpose. "Active" treats them as "start timer";
// "Resumed" treats them as "clear the held flag".

const ACTIVE_STATES: ReadonlyArray<CallState> = ['Connected', 'StreamsRunning'];
const TERMINAL_STATES: ReadonlyArray<CallState> = [
  'End',       // local hangup, normal termination
  'Released',  // SIP dialog fully torn down
  'Error',     // SIP error (busy, not-found, network drop, etc.)
];
const HELD_STATES: ReadonlyArray<CallState> = [
  'Pausing',         // local pause in progress
  'Paused',          // local pause complete
  'PausedByRemote',  // peer put us on hold
];
const RESUMED_STATES: ReadonlyArray<CallState> = [
  'Resuming',
  'Connected',
  'StreamsRunning',
];

export function CallProvider(props: CallProviderProps): React.JSX.Element {
  const {
    children,
    config = null,
    autoRegister = true,
    enableNativeServices = true,
    requestMicPermission = true,
    onIncomingCall,
    onOutgoingCall,
    onCallEnded,
    onCallStateChanged,
    onRegistrationStateChanged,
    onError,
  } = props;

  // ── Stable refs for the event callbacks ──────────────────────────────────
  //
  // The host app typically passes inline arrow functions:
  //
  //     <CallProvider onIncomingCall={(i) => navigation.navigate(…)} />
  //
  // Each render produces a NEW function identity. If we depended on these
  // directly in the subscription useEffect, every render would tear down the
  // native event subscriptions and re-create them — guaranteed to drop
  // events that happen mid-render. So we mirror them into refs and let the
  // event handlers read `.current` at fire time.
  //
  // The trailing `useEffect` (no deps array) runs after every commit, which
  // keeps `current` aligned with the latest props.
  const onIncomingCallRef = useRef(onIncomingCall);
  const onOutgoingCallRef = useRef(onOutgoingCall);
  const onCallEndedRef = useRef(onCallEnded);
  const onCallStateChangedRef = useRef(onCallStateChanged);
  const onRegistrationStateChangedRef = useRef(onRegistrationStateChanged);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onIncomingCallRef.current = onIncomingCall;
    onOutgoingCallRef.current = onOutgoingCall;
    onCallEndedRef.current = onCallEnded;
    onCallStateChangedRef.current = onCallStateChanged;
    onRegistrationStateChangedRef.current = onRegistrationStateChanged;
    onErrorRef.current = onError;
  });

  // ----- State -----
  const [registration, setRegistration] = useState<RegistrationEvent | null>(
    null
  );
  const [callStatus, setCallStatus] = useState<CallState>('Idle');
  const [incoming, setIncoming] = useState(false);
  const [incomingInfo, setIncomingInfo] = useState<IncomingCallInfo | null>(
    null
  );
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [held, setHeld] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [ending, setEnding] = useState(false);

  // ── Duration timer ────────────────────────────────────────────────────────
  //
  // We anchor the timer to a wall-clock timestamp (`startTsRef`) rather than
  // incrementing a counter. Why? `setInterval` drifts when the device is
  // backgrounded, the JS thread stalls, or the user switches apps. By
  // re-computing `now - start` on every tick we always show the true elapsed
  // time, even if 30 intervals were skipped while the screen was off.
  //
  // The 500ms tick is half a second of "lag" worst-case but spares the JS
  // thread the overhead of a 30Hz refresh — UI just renders to second
  // precision anyway.
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTsRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  }, []);

  // Called when a new call starts — wipes the previous duration so the UI
  // doesn't briefly show the old call's timer.
  const resetDuration = useCallback(() => {
    clearTimer();
    startTsRef.current = null;
    setDurationSec(0);
  }, [clearTimer]);

  // Idempotent: calling startDuration() multiple times during the same call
  // doesn't restart the clock. This matters because Linphone can fire
  // `Connected` and `StreamsRunning` back-to-back, and we'd otherwise reset
  // the start time on the second event.
  const startDuration = useCallback(() => {
    if (tickRef.current) return;
    startTsRef.current = Date.now();
    tickRef.current = setInterval(() => {
      if (startTsRef.current != null) {
        setDurationSec((Date.now() - startTsRef.current) / 1000);
      }
    }, 500);
  }, []);

  // ── Initial boot sequence: native init → mic permission → services ──────
  //
  // Order matters:
  //   1. Native.init() — boots the Linphone Core. Required before anything
  //      else; safe to call multiple times (the native side is idempotent).
  //   2. Mic permission — Linphone won't open the mic without it. We do this
  //      eagerly so the user is prompted once on first launch rather than
  //      mid-call. Set `requestMicPermission={false}` to skip and handle it
  //      yourself.
  //   3. Background service (Android only) — keeps the SIP socket alive when
  //      the app is backgrounded. On iOS this is the host app's job via
  //      VoIP push, so the call is a no-op.
  //
  // `cancelled` guards against the provider unmounting mid-await. Without
  // it, a fast remount-then-unmount could fire `onError` callbacks against
  // a stale provider instance.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Native.init();
        if (cancelled) return;
        if (requestMicPermission) {
          const granted = await Native.ensureMicPermission();
          if (!granted) {
            onErrorRef.current?.({
              code: 'MIC_PERMISSION_DENIED',
              message:
                'Microphone permission denied. Calls cannot be made or received.',
            });
          }
        }
        if (enableNativeServices && Platform.OS === 'android') {
          Native.startNativeServices();
        }
      } catch (e: any) {
        onErrorRef.current?.({
          code: 'INIT_FAILED',
          message: e?.message ?? String(e),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enableNativeServices, requestMicPermission]);

  // ── Native event subscriptions ───────────────────────────────────────────
  //
  // This effect runs once and never re-runs (its deps array contains only
  // stable useCallback refs). All five events from the native module are
  // bridged into React state here:
  //
  //   RegistrationChanged  → setRegistration + onRegistrationStateChanged
  //   CallIncoming         → setIncoming(true) + onIncomingCall
  //   CallState            → setCallStatus + timer/hold/cleanup based on FSM
  //   CallEnded            → reset transient state + onCallEnded
  //
  // The cleanup function removes all subscriptions on unmount. Critically,
  // we DO NOT call `Native.stopNativeServices()` here — that would kill the
  // foreground service even on a transient unmount. Apps that want to fully
  // shut down call functionality (e.g. on logout) should call
  // `stopNativeServices(true)` explicitly via the hook.
  useEffect(() => {
    // Registration state changes — `progress`, `ok`, `failed`, etc.
    // `regStateName()` normalises the raw value to a canonical lowercase
    // string. We surface `failed` as a structured error so the host app can
    // distinguish "user hasn't logged in yet" from "credentials are bad".
    const subReg = Native.on.RegistrationChanged((e: any) => {
      const pretty = regStateName(e?.state);
      const event: RegistrationEvent = { ...e, state: pretty, pretty };
      setRegistration(event);
      onRegistrationStateChangedRef.current?.(event);
      if (pretty === 'failed') {
        onErrorRef.current?.({
          code: 'REGISTRATION_FAILED',
          message: e?.message || 'SIP registration failed',
        });
      }
    });

    // Incoming call — pick the best display name we have. SIP can deliver
    // any of: displayName ("Jane Doe"), username ("100"), or full URI
    // ("sip:+234…@gateway"). Some servers send "anonymous" as the display
    // name when caller-ID is suppressed; we treat that as missing and fall
    // back to the username instead.
    const subIncoming = Native.on.CallIncoming((e: any = {}) => {
      const display = (e.displayName || '').trim();
      const user = (e.username || '').trim();
      const parsed = parseSipUser(e.uri || '');
      const phone =
        display && display.toLowerCase() !== 'anonymous'
          ? display
          : user || parsed || 'Unknown';
      const info: IncomingCallInfo = {
        name: phone,
        phone,
        initials: initialsFrom(phone),
        callId: e?.callId,
        uri: e?.uri,
      };
      setIncoming(true);
      setIncomingInfo(info);
      setCallStatus('IncomingReceived');
      onIncomingCallRef.current?.(info);
    });

    // Generic call state transitions — drives the FSM defined at the top of
    // the file. The four set-membership checks below are mutually exclusive
    // for any single event (e.g. a state can't be both ACTIVE and TERMINAL),
    // so the if-chain is intentional, not a fall-through bug.
    const subState = Native.on.CallState((e: any) => {
      const pretty = callStateName(e?.state);
      setCallStatus(pretty);
      onCallStateChangedRef.current?.(pretty);

      if (HELD_STATES.includes(pretty)) setHeld(true);
      if (RESUMED_STATES.includes(pretty)) setHeld(false);

      if (ACTIVE_STATES.includes(pretty)) {
        // Media is flowing. If this was an incoming call, clear the
        // "ringing" flag so the UI moves from incoming-screen → in-call.
        setIncoming(false);
        startDuration();
      }

      if (TERMINAL_STATES.includes(pretty)) {
        // Freeze the duration (don't reset to 0) so the UI can show
        // "Call ended · 2:34" for a moment before navigation pops the
        // screen. Audio toggles reset because they don't persist across
        // calls — mute is per-session.
        clearTimer();
        setIncoming(false);
        setIncomingInfo(null);
        setMuted(false);
        setSpeakerOn(false);
      }
    });

    // CallEnded fires AFTER the CallState transition to End/Released. It's
    // a convenience event — listeners that only care about "call is gone"
    // can subscribe to this without parsing every state transition.
    const subEnd = Native.on.CallEnded(() => {
      clearTimer();
      setIncoming(false);
      setIncomingInfo(null);
      setMuted(false);
      setSpeakerOn(false);
      onCallEndedRef.current?.();
    });

    return () => {
      subReg.remove();
      subIncoming.remove();
      subState.remove();
      subEnd.remove();
      clearTimer();
    };
  }, [clearTimer, startDuration]);

  // ── Registration ─────────────────────────────────────────────────────────
  //
  // Three entry points into the SIP registration flow:
  //
  //   - Auto-register effect (below) — fires whenever `config` changes
  //   - register(cfg?)             — host app forces a re-register
  //   - refreshRegistration()      — light-touch refresh, skips full setup
  //                                  when the existing session looks healthy

  // Internal helper — strips `https://` and trailing `/` from the domain
  // (a common user-input mistake) before handing the params to native.
  // Native is permissive about transport, but defaults to TCP if unset
  // because most production PBXs allow TCP and it's NAT-friendlier than UDP.
  const registerWith = useCallback(
    async (cfg: SipConfig) => {
      const domain = formatTenantDomain(cfg.domain);
      const transport = cfg.transport ?? 'tcp';
      Native.register({
        username: cfg.username,
        password: cfg.password,
        domain,
        transport,
      });
    },
    []
  );

  // Auto-register whenever `config` changes. Identity comparison only —
  // passing the same SIP config object on every render is fine, but passing
  // `{...sip}` will re-register every time, so don't do that.
  useEffect(() => {
    if (!autoRegister) return;
    if (!config || !config.username) return;
    registerWith(config).catch((e) =>
      onErrorRef.current?.({
        code: 'REGISTER_FAILED',
        message: e?.message ?? String(e),
      })
    );
  }, [config, autoRegister, registerWith]);

  // ── Public actions returned from useCall() ───────────────────────────────

  // Force a re-register. Use this when:
  //  - You disabled `autoRegister` and want to control timing yourself.
  //  - You want to switch accounts at runtime — pass the new config as arg.
  //  - The user toggled a "Reconnect" button after a network blip.
  const register = useCallback(
    async (overrideCfg?: SipConfig) => {
      const next = overrideCfg ?? config ?? undefined;
      if (!next || !next.username) {
        onErrorRef.current?.({
          code: 'NO_CONFIG',
          message: 'No SIP config available — pass `config` to <CallProvider> or call register({...}).',
        });
        return;
      }
      await registerWith(next);
    },
    [config, registerWith]
  );

  // Smart refresh — if registration was already in a working state, we use
  // Linphone's lightweight `refreshRegisters()` (it just re-pings the
  // server). If it was failed/cleared, we do a full re-register from
  // scratch since the lightweight refresh won't recover from a 401 or DNS
  // blackhole.
  const refreshRegistration = useCallback(async () => {
    const state = registration?.state;
    if (!state || state === 'none' || state === 'cleared' || state === 'failed') {
      if (config) await registerWith(config);
      return;
    }
    Native.refreshRegisters();
  }, [registration, config, registerWith]);

  const unregister = useCallback(async () => {
    Native.setRegisterEnabled(false);
  }, []);

  // Place an outgoing call. Accepts either:
  //   - a plain extension/number ("100" or "+2348012345678") — combined with
  //     `config.domain` to form `sip:<dest>@<domain>`
  //   - a fully-qualified SIP URI ("sip:user@gateway.example.com") — passed
  //     through unchanged, useful when dialling external PSTN gateways
  //
  // We optimistically set status to OutgoingInit before the native call
  // returns so the UI can render immediately — the real state will be
  // confirmed by the next CallState event in ~50ms.
  const dial = useCallback(
    async (destination: string) => {
      if (!destination || destination.length < 1) {
        onErrorRef.current?.({
          code: 'INVALID_NUMBER',
          message: 'Cannot dial an empty number.',
        });
        return;
      }
      if (!config?.domain) {
        onErrorRef.current?.({
          code: 'NO_CONFIG',
          message: 'Cannot dial: no SIP domain configured.',
        });
        return;
      }
      resetDuration();
      const uri = destinationToSipUri(destination, config.domain);
      setCallStatus('OutgoingInit');
      Native.call(uri);
      onOutgoingCallRef.current?.({
        phone: destination,
        initials: initialsFrom(destination),
      });
    },
    [config?.domain, resetDuration]
  );

  const answer = useCallback(async () => {
    setIncoming(false);
    setCallStatus('Connected');
    resetDuration();
    Native.answer();
  }, [resetDuration]);

  // Hangup is debounced via the `ending` flag — Linphone takes ~500ms to
  // settle, and tapping the end-call button twice in that window can put it
  // into a weird state. The 600ms timer is empirical: long enough to swallow
  // double-taps, short enough that the next call attempt isn't blocked.
  const hangup = useCallback(async () => {
    if (ending) return;
    setEnding(true);
    try {
      Native.end();
    } finally {
      setTimeout(() => setEnding(false), 600);
    }
  }, [ending]);

  // Decline an incoming call with a specific SIP response code. Default is
  // "busy" (486) which is how voicemail systems usually decide to take a
  // message; use "declined" if you don't want the caller routed to VM.
  const decline = useCallback(async (reason: DeclineReason = 'busy') => {
    Native.decline(reason);
  }, []);

  // Toggle helpers use the functional setState form so concurrent taps don't
  // race — without it, `next = !muted` could read stale state if React is
  // batching renders.
  const toggleMute = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      Native.mute(next);
      return next;
    });
  }, []);

  const toggleSpeaker = useCallback(() => {
    setSpeakerOn((current) => {
      const next = !current;
      Native.speaker(next);
      return next;
    });
  }, []);

  // No optimistic update here — `held` is driven by HELD_STATES / RESUMED_STATES
  // from the native CallState event, so we just kick off the action and let
  // the event update React state.
  const toggleHold = useCallback(() => {
    if (held) Native.resume();
    else Native.hold();
  }, [held]);

  // Send a DTMF (touch-tone) digit IN BAND on the active call — used for
  // navigating IVRs ("Press 1 for support…"). Different from playKeyTone,
  // which only plays a UI feedback tone locally.
  const sendDtmf = useCallback((digit: string) => {
    if (!digit) return;
    Native.sendDtmf(String(digit));
  }, []);

  // Local DTMF feedback tone — plays the standard touch-tone sound through
  // the device speaker when the user taps a key on the dial-pad. Does NOT
  // send anything over the SIP call; for that, use sendDtmf().
  const playKeyTone = useCallback((digit: string) => {
    if (!digit) return;
    Native.playKeyTone(String(digit));
  }, []);

  const getCallLogs = useCallback(async (): Promise<CallLogEntry[]> => {
    try {
      return await Native.getCallLogs();
    } catch (e: any) {
      onErrorRef.current?.({
        code: 'GET_CALL_LOGS_FAILED',
        message: e?.message ?? String(e),
      });
      return [];
    }
  }, []);

  const getRegistrationStatus = useCallback(
    async (): Promise<RegistrationEvent> => {
      const raw = await Native.getRegistrationStatus();
      const pretty = regStateName(raw?.state);
      return { ...raw, state: pretty, pretty };
    },
    []
  );

  const startServices = useCallback(() => Native.startNativeServices(), []);
  const stopServices = useCallback(
    (logout = false) => Native.stopNativeServices(logout),
    []
  );

  const formattedDuration = useMemo(
    () => formatDuration(durationSec),
    [durationSec]
  );

  const value: CallApi = useMemo(
    () => ({
      config,
      registration,
      callStatus,
      durationSec,
      formattedDuration,
      incoming,
      incomingInfo,
      isMuted: muted,
      isSpeaker: speakerOn,
      isHeld: held,
      dial,
      answer,
      hangup,
      decline,
      toggleMute,
      toggleSpeaker,
      toggleHold,
      sendDtmf,
      playKeyTone,
      register,
      refreshRegistration,
      unregister,
      getCallLogs,
      getRegistrationStatus,
      startNativeServices: startServices,
      stopNativeServices: stopServices,
    }),
    [
      config,
      registration,
      callStatus,
      durationSec,
      formattedDuration,
      incoming,
      incomingInfo,
      muted,
      speakerOn,
      held,
      dial,
      answer,
      hangup,
      decline,
      toggleMute,
      toggleSpeaker,
      toggleHold,
      sendDtmf,
      playKeyTone,
      register,
      refreshRegistration,
      unregister,
      getCallLogs,
      getRegistrationStatus,
      startServices,
      stopServices,
    ]
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

/**
 * Access the call API from any descendant of `<CallProvider>`.
 *
 * Throws if used outside the provider.
 */
export function useCall(): CallApi {
  const ctx = useContext(CallContext);
  if (!ctx) {
    throw new Error(
      '`useCall()` must be used inside `<CallProvider>`. Mount the provider near the root of your app tree.'
    );
  }
  return ctx;
}

/** Internal — exported for power users who want to read the context without throwing. */
export function useCallSafe(): CallApi | null {
  return useContext(CallContext);
}

/** Re-export to allow `formatDuration`, `callStatusLabel`, etc. to be imported from the main entry too. */
export { callStatusLabel, formatDuration };
