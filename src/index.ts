/**
 * Public entry point for `@nativetalk/react-native-call-sdk`.
 *
 * Most apps only need:
 *
 * ```tsx
 * import { CallProvider, useCall } from '@nativetalk/react-native-call-sdk';
 * ```
 *
 * Optional UI components are exported from the `/ui` sub-path:
 *
 * ```tsx
 * import { Dialer, IncomingCallView, OutgoingCallView } from '@nativetalk/react-native-call-sdk/ui';
 * ```
 *
 * Power-users can reach the raw native bridge:
 *
 * ```ts
 * import { CallEngine } from '@nativetalk/react-native-call-sdk';
 * CallEngine.call('sip:100@sip.example.com');
 * ```
 */

export { CallProvider, useCall, useCallSafe } from './CallProvider';
export type {
  CallApi,
  CallLogEntry,
  CallProviderEvents,
  CallProviderProps,
  CallState,
  DeclineReason,
  IncomingCallInfo,
  RegistrationEvent,
  RegistrationState,
  SipConfig,
  SipTransport,
} from './types';
export {
  callStateName,
  callStatusLabel,
  destinationToSipUri,
  formatDuration,
  formatTenantDomain,
  initialsFrom,
  parseSipUser,
  regStateName,
  sanitizeDial,
} from './helpers';

import * as Native from './native';

/**
 * Direct access to the native bridge.
 *
 * This is escape-hatch territory — prefer `useCall()` whenever possible. Use
 * `CallEngine` only when you need to drive the SDK from outside React (e.g.
 * a headless task) or to wire iOS VoIP push tokens.
 */
export const CallEngine = {
  init: Native.init,
  register: Native.register,
  call: Native.call,
  answer: Native.answer,
  end: Native.end,
  hangup: Native.end,
  decline: Native.decline,
  mute: Native.mute,
  speaker: Native.speaker,
  hold: Native.hold,
  resume: Native.resume,
  sendDtmf: Native.sendDtmf,
  playKeyTone: Native.playKeyTone,
  refreshRegisters: Native.refreshRegisters,
  setRegisterEnabled: Native.setRegisterEnabled,
  getRegistrationStatus: Native.getRegistrationStatus,
  getCallLogs: Native.getCallLogs,
  startNativeServices: Native.startNativeServices,
  stopNativeServices: Native.stopNativeServices,
  registerVoipToken: Native.registerVoipToken,
  ensureMicPermission: Native.ensureMicPermission,
  on: Native.on,
};

export { callEvents } from './native';
