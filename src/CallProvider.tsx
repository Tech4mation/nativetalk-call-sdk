/**
 * <CallProvider> — the single React component the host app mounts to enable
 * calling. It wires the native event stream into React state and exposes
 * everything through `useCall()`.
 *
 * Design notes:
 * - No coupling to auth, navigation, or any specific HTTP client. SIP config
 *   is passed in as a prop; lifecycle events (incoming, ended) are exposed as
 *   callbacks so the host app decides how to navigate / display screens.
 * - Safe to mount with `config={null}` while you fetch credentials — the SDK
 *   simply idles until a real config arrives.
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

// Statuses that mean "we own the audio path — start the duration timer".
const ACTIVE_STATES: ReadonlyArray<CallState> = ['Connected', 'StreamsRunning'];
// Statuses that mean "the call is finished — freeze the duration".
const TERMINAL_STATES: ReadonlyArray<CallState> = [
  'End',
  'Released',
  'Error',
];
// Statuses that mean "we're on hold".
const HELD_STATES: ReadonlyArray<CallState> = [
  'Pausing',
  'Paused',
  'PausedByRemote',
];
const RESUMED_STATES: ReadonlyArray<CallState> = [
  'Resuming',
  'Connected',
  'StreamsRunning',
];

export function CallProvider(props: CallProviderProps): JSX.Element {
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

  // ----- Stable refs for the event callbacks so we never resubscribe -----
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

  // ----- Timer -----
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTsRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  }, []);

  const resetDuration = useCallback(() => {
    clearTimer();
    startTsRef.current = null;
    setDurationSec(0);
  }, [clearTimer]);

  const startDuration = useCallback(() => {
    if (tickRef.current) return;
    startTsRef.current = Date.now();
    tickRef.current = setInterval(() => {
      if (startTsRef.current != null) {
        setDurationSec((Date.now() - startTsRef.current) / 1000);
      }
    }, 500);
  }, []);

  // ----- Initial native init + mic permission -----
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

  // ----- Native event subscriptions (mount once, never resubscribe) -----
  useEffect(() => {
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

    const subState = Native.on.CallState((e: any) => {
      const pretty = callStateName(e?.state);
      setCallStatus(pretty);
      onCallStateChangedRef.current?.(pretty);

      if (HELD_STATES.includes(pretty)) setHeld(true);
      if (RESUMED_STATES.includes(pretty)) setHeld(false);

      if (ACTIVE_STATES.includes(pretty)) {
        setIncoming(false);
        startDuration();
      }

      if (TERMINAL_STATES.includes(pretty)) {
        clearTimer();
        setIncoming(false);
        setIncomingInfo(null);
        setMuted(false);
        setSpeakerOn(false);
      }
    });

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

  // ----- Registration -----
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

  // Auto-register whenever `config` changes (if enabled)
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

  // ----- Actions -----
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

  const hangup = useCallback(async () => {
    if (ending) return;
    setEnding(true);
    try {
      Native.end();
    } finally {
      setTimeout(() => setEnding(false), 600);
    }
  }, [ending]);

  const decline = useCallback(async (reason: DeclineReason = 'busy') => {
    Native.decline(reason);
  }, []);

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

  const toggleHold = useCallback(() => {
    if (held) Native.resume();
    else Native.hold();
  }, [held]);

  const sendDtmf = useCallback((digit: string) => {
    if (!digit) return;
    Native.sendDtmf(String(digit));
  }, []);

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
