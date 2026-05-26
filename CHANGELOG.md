# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — Initial release

### Added
- SIP/VoIP calling powered by the Linphone SDK 5.x
- React `<CallProvider>` and `useCall()` hook for plug-and-play integration
- Decoupled config — pass SIP credentials as props, no auth/navigation coupling
- Call controls: `dial`, `answer`, `hangup`, `decline`, `toggleMute`, `toggleSpeaker`, `toggleHold`, `sendDtmf`, `playKeyTone`
- Call state: `registration`, `callStatus`, `incoming`, `incomingInfo`, `durationSec`, `formattedDuration`
- Local call logs via `getCallLogs()`
- Optional UI components: `<Dialer />`, `<IncomingCallView />`, `<OutgoingCallView />`
- Android: foreground service + notification channels for incoming/ongoing calls
- iOS: AVAudioSession management, CallKit/PushKit integration hooks
- Optional `<TelephonyObserver>` for monitoring native GSM call state
- Lifecycle helpers: `startNativeServices`, `stopNativeServices`
- TypeScript types throughout
