# iOS setup deep-dive

iOS needs more manual work than Android because:
- The `linphonesw` pod is bundled in the package rather than published, so your
  `Podfile` has to point at it (one line, below).
- CallKit + VoIP push live in the AppDelegate, before React Native exists.

This page is the complete walkthrough.

## 1. CocoaPods

Add one line to your `Podfile`, inside your app's `target` block:

```ruby
pod 'linphonesw', :path => '../node_modules/@nativetalkcommunications/react-native-call-sdk/linphonesw-pod'
```

Then install:

```bash
cd ios && pod install
```

The SDK's own `NativetalkCallSdk.podspec` is autolinked, so it needs no Podfile
entry. `linphonesw` does, because of what it is: a self-contained pod **bundled
inside the npm package** at `linphonesw-pod/`, which downloads the Linphone
xcframeworks (5.4.117) in its `prepare_command` on first install. A `:path` pod
is not in any spec repo, so CocoaPods cannot resolve the SDK's
`s.dependency "linphonesw"` without being told where it lives:

```
[!] Unable to find a specification for `linphonesw` depended upon by `NativetalkCallSdk`
```

That is the error, and the line above is the whole fix.

**Expo:** the config plugin writes this line for you. Add
`@nativetalkcommunications/react-native-call-sdk` to `plugins` in `app.json`
and run `npx expo prebuild`. **Bare React Native: add it yourself.**

The first `pod install` downloads about 15 xcframeworks and takes a few
minutes. CocoaPods caches the prepared pod, so it happens once per machine per
Linphone version.

## 2. One build setting

*Build Settings* → **Build Libraries for Distribution** must be `NO`. If it is
`YES`, Swift symbol mangling breaks and the app crashes with `_swift_*` symbol
errors. This is a Linphone constraint, not ours.

Nothing else is needed to make `import linphonesw` resolve. In particular:

> **Do not drag Linphone frameworks into Xcode.** Earlier versions of this page
> told you to download a Linphone release and add the `.xcframework`s by hand.
> That was wrong, and it is no longer needed: the pod does it. If you already
> did it, remove them — two copies of Linphone in one target will not link.

## 3. Info.plist

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Microphone access is required for calls.</string>

<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
  <string>voip</string>
  <string>remote-notification</string>   <!-- only if you use VoIP push -->
</array>
```

## 4. Capabilities

In Xcode → *Signing & Capabilities*:

- **Background Modes** → tick **Audio, AirPlay, and Picture-in-Picture** and
  **Voice over IP**.
- (Optional, if using VoIP push) **Push Notifications**.

## 5. CallKit + VoIP push (not optional in practice)

Without VoIP push, an incoming call only wakes the app if the SIP socket is
already open — which means iOS must not have suspended the app. Apple
specifically forbids long-running socket keep-alives, so for reliable
incoming-call delivery you need **VoIP push** + **CallKit**.

The flow:

1. App registers a PushKit `PKPushRegistry` and tells iOS it wants `.voIP`.
2. iOS hands you a hex token; you forward it to your SIP server via your own
   backend.
3. When a call arrives, your SIP server triggers an APNs VoIP push.
4. iOS wakes your app and calls
   `pushRegistry(_:didReceiveIncomingPushWith:…)`. You **must**
   `reportNewIncomingCall(with:update:)` to CallKit **before** the completion
   handler returns. This is the one rule that has a permanent consequence: a
   VoIP push handled without reporting a call makes iOS force quit the app
   **and then stop delivering VoIP pushes to that handset until the app is
   reinstalled**. The phone stops ringing for good, and nothing logs why.

The SDK doesn't bundle this code because the wiring depends on your app's
launch sequence and notification UX. A copy-paste-ready template is in
[push-notifications.md](push-notifications.md).

If your app is published from your own Apple Developer account rather than
Nativetalk's, also read [voip-push-setup.md](voip-push-setup.md). Our server
cannot wake your app with our key, so there is a key you have to create and
send us before any push reaches it.

Hooking it back to the SDK is one line:

```swift
import NativetalkCallSdk

// PushKit delegate
func pushRegistry(_ registry: PKPushRegistry,
                  didUpdate pushCredentials: PKPushCredentials,
                  for type: PKPushType) {
  guard type == .voIP else { return }
  let token = pushCredentials.token.map { String(format: "%02.2hhx", $0) }.joined()

  // 1. Send token to your backend so it knows where to push.
  YourApi.uploadVoipToken(token)

  // 2. Hand it to Linphone via the SDK.
  //    Posted to NSNotificationCenter so the Swift module picks it up even
  //    if React isn't yet initialised.
  NotificationCenter.default.post(
    name: Notification.Name("Linphone.RegisterVoipToken"),
    object: nil,
    userInfo: ["token": token]
  )
}
```

Alternatively, from your JS layer:

```ts
import { CallEngine } from '@nativetalkcommunications/react-native-call-sdk';
CallEngine.registerVoipToken(hex);
```

## 6. Build phases — bridging header

If your app is pure-Objective-C, Xcode will offer to create a bridging
header when you add the first Swift file. Accept. The SDK doesn't require
extra entries.

## 7. Simulator caveats

VoIP doesn't work on simulators on iOS — no microphone, no audio output,
PushKit doesn't deliver. **Test on a real device.**

## 8. Verify

Build and run on a device. In the Xcode console you should see:

```
NativetalkCallSdk: Core started
NativetalkCallSdk: Registration -> ok
```

If you see crashes mentioning `_swift_*` symbols, double-check **Build Libraries
for Distribution** is `NO`.
