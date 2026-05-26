/**
 * Optional UI components for the Nativetalk Call SDK.
 *
 * These are entirely opt-in — the core hook (`useCall()`) gives you everything
 * you need to roll your own UI. The components here are kept deliberately
 * minimal (no external icon packs, no navigation library) so they work in
 * any RN project.
 */
export { Dialer } from './Dialer';
export { IncomingCallView } from './IncomingCallView';
export { OutgoingCallView } from './OutgoingCallView';
export { Avatar } from './Avatar';
export { defaultTheme, mergeTheme, type CallTheme } from './theme';
