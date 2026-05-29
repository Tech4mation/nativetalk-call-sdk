# iOS setup deep-dive

iOS needs more manual work than Android because:
- Linphone for iOS isn't on CocoaPods (must be added to Xcode by hand).
- CallKit + VoIP push live in the AppDelegate, before React Native exists.

This page is the complete walkthrough.

## 1. CocoaPods

```bash
cd ios && pod install
```

The SDK's `NativetalkCallSdk.podspec` is autolinked.

## 2. Add the Linphone iOS framework

1. Download the latest iOS Linphone SDK from
   <https://gitlab.linphone.org/BC/public/linphone-sdk/-/releases>
   (look for the iOS `.zip`, e.g. `linphone-sdk-iphone-5.4.44.zip`).
2. Unzip. You'll get a `Frameworks/` directory containing several
   `.xcframework` bundles, including `linphonesw.xcframework`.
3. In Xcode, drag all the frameworks into your project navigator. Tick
   **Copy items if needed** and **Add to target: <YourApp>**.
4. Open your target's *General* tab → **Frameworks, Libraries, and Embedded
   Content**. For every framework you just added, set **Embed & Sign**.
5. *Build Settings* → set **Always Embed Swift Standard Libraries** to `YES`.
6. *Build Settings* → ensure **Build Libraries for Distribution** is `NO`
   (it must be `NO`, or Swift symbol mangling will break).

Rebuild. The SDK's `import linphonesw` will now resolve.

> **Why is this manual?**
> Linphone's iOS SDK is distributed as `.xcframework` binaries and they ship
> a separate one per major version. A CocoaPods spec would lock every consumer
> onto a fixed version. By keeping it host-managed, you can upgrade Linphone
> at your own pace.

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

## 5. CallKit + VoIP push (optional but recommended)

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
   handler returns — failure to do so will crash your app on iOS 13+.

The SDK doesn't bundle this code because the wiring depends on your app's
launch sequence and notification UX. A copy-paste-ready template is in
[push-notifications.md](push-notifications.md).

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
import { CallEngine } from '@nativetalk/react-native-call-sdk';
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
