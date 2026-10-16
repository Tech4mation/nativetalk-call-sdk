# Push notifications

Without push, an incoming call only arrives when the app's SIP socket is
already open. On iOS in particular, that means the app must be foregrounded
(iOS aggressively suspends sockets in the background).

This doc covers the recommended setup.

If you are publishing the app under your own Apple or Google account, read
[VoIP Push Setup](voip-push-setup.md) as well. It covers the key you have to
create and upload, which is what lets a push reach your app at all.

## iOS — VoIP push + CallKit

A complete `AppDelegate.swift` you can drop in.

> ⚠️ **One rule above all others.** Every VoIP push your app receives must
> reach `reportNewIncomingCall` before it calls `completion()`. If it ever does
> not, iOS force quits the app and then stops delivering VoIP pushes to that
> handset until the app is reinstalled. The phone stops ringing permanently and
> nothing logs why. The template below has no early return between the push
> arriving and the call being reported, and neither should yours.

```swift
import UIKit
import React
import React_RCTAppDelegate
import PushKit
import CallKit
import AVFoundation
import UserNotifications
import CryptoKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate,
                   PKPushRegistryDelegate, UNUserNotificationCenterDelegate,
                   CXProviderDelegate {

  var window: UIWindow?
  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  private var voipRegistry: PKPushRegistry?
  private var callKitProvider: CXProvider?
  private var rnInitialized = false
  private var deferredLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?

  func application(_ application: UIApplication,
                   didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {

    self.deferredLaunchOptions = launchOptions

    // CallKit + PushKit must be ready before iOS delivers a VoIP push.
    configureCallKitAndPushKit()

    // Defer React Native init by a tick — gives PushKit time to deliver any
    // pending push that woke the app.
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
      if !self.rnInitialized {
        self.initializeReactNative(launchOptions: launchOptions)
      }
    }
    return true
  }

  private func configureCallKitAndPushKit() {
    _ = provider

    let reg = PKPushRegistry(queue: .main)
    reg.delegate = self
    reg.desiredPushTypes = [.voIP]
    self.voipRegistry = reg
  }

  /// The CallKit provider, built on first use and never nil.
  ///
  /// Deliberately not an optional the push handler has to unwrap. Reporting a
  /// call is not optional — see the warning below — so a code path that gives
  /// up because the provider was not ready yet is a path that force quits the
  /// app and stops the handset receiving VoIP pushes altogether.
  private var provider: CXProvider {
    if let existing = callKitProvider { return existing }
    let config = CXProviderConfiguration(localizedName: "YourApp")
    config.supportsVideo = false
    config.maximumCallsPerCallGroup = 1
    config.supportedHandleTypes = [.phoneNumber, .generic]
    let made = CXProvider(configuration: config)
    made.setDelegate(self, queue: nil)
    callKitProvider = made
    return made
  }

  private func initializeReactNative(launchOptions: [UIApplication.LaunchOptionsKey: Any]?) {
    guard !rnInitialized else { return }

    UNUserNotificationCenter.current().delegate = self
    UIApplication.shared.registerForRemoteNotifications()

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    reactNativeDelegate = delegate
    reactNativeFactory = factory

    let window = UIWindow(frame: UIScreen.main.bounds)
    self.window = window
    factory.startReactNative(withModuleName: "YourApp",
                             in: window, launchOptions: launchOptions)
    window.makeKeyAndVisible()
    rnInitialized = true
  }

  // MARK: - PushKit

  func pushRegistry(_ registry: PKPushRegistry,
                    didUpdate pushCredentials: PKPushCredentials,
                    for type: PKPushType) {
    guard type == .voIP else { return }
    let token = pushCredentials.token.map { String(format: "%02.2hhx", $0) }.joined()
    UserDefaults.standard.set(token, forKey: "voip_token")

    // Also send this token to your backend, which registers it with us for
    // the SIP device this person signs in with, or nothing will ever be pushed
    // to it. See voip-push-setup.md, "Registering a handset". iOS issues a new
    // token after a reinstall, so send it every time this fires rather than once.

    // Hand the token to the SDK so it can register it with the SIP server.
    NotificationCenter.default.post(
      name: Notification.Name("Linphone.RegisterVoipToken"),
      object: nil,
      userInfo: ["token": token]
    )
  }

  func pushRegistry(_ registry: PKPushRegistry,
                    didReceiveIncomingPushWith payload: PKPushPayload,
                    for type: PKPushType,
                    completion: @escaping () -> Void) {

    guard type == .voIP else {
      completion()
      return
    }

    // Everything below has a fallback, on purpose. There is no early return
    // between here and reportNewIncomingCall, because iOS treats a VoIP push
    // handled without reporting a call as a broken app: it force quits, and
    // then stops delivering VoIP pushes to the handset until the app is
    // reinstalled. A missing field is a call screen saying "Unknown". A return
    // is a phone that stops ringing for good.
    let dict = payload.dictionaryPayload
    let callData = dict["call_data"] as? [String: Any]
    let callIdString = (callData?["call_id"] as? String)
      ?? (dict["call_id"] as? String) ?? UUID().uuidString
    let caller = (callData?["caller"] as? String)
      ?? (dict["caller"] as? String) ?? "Unknown"

    let callUUID = AppDelegate.callUUID(from: callIdString)
    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(type: .phoneNumber, value: caller)
    update.hasVideo = false
    update.localizedCallerName = caller

    // CRITICAL: report to CallKit before this function returns.
    provider.reportNewIncomingCall(with: callUUID, update: update) { error in
      if let error = error {
        // The call was still reported, which is what iOS is watching for.
        // Common causes are Do Not Disturb and a blocked caller, and neither
        // is yours to fix.
        NSLog("CallKit would not show the call: \(error.localizedDescription)")
      }
      if !self.rnInitialized {
        self.initializeReactNative(launchOptions: self.deferredLaunchOptions)
      }
      completion()
    }
  }

  /// A stable call UUID for a push.
  ///
  /// The server sends `call_id` as a UUID, so the first branch is the normal
  /// one. The fallback hashes instead of inventing a fresh UUID, because the
  /// same call can be pushed twice — a retry, or a ring group — and two
  /// different UUIDs for one call means CallKit shows two call screens and the
  /// one the user answers is not the one the SDK is holding.
  private static func callUUID(from callId: String) -> UUID {
    if let parsed = UUID(uuidString: callId) { return parsed }
    var digest = Array(Insecure.MD5.hash(data: Data(callId.utf8)))
    digest[6] = (digest[6] & 0x0F) | 0x30  // version 3
    digest[8] = (digest[8] & 0x3F) | 0x80  // RFC 4122 variant
    return NSUUID(uuidBytes: digest) as UUID
  }

  // MARK: - CallKit

  func providerDidReset(_ provider: CXProvider) {}
  func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    // Optionally forward to the SDK so JS can navigate to the in-call screen.
    action.fulfill()
  }
  func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    action.fulfill()
  }
  func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {}
  func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {}
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? { self.bundleURL() }
  override func bundleURL() -> URL? {
    #if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
    #else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
    #endif
  }
}
```

### Backend payload

What the Nativetalk call server sends, as the whole VoIP push payload:

```json
{
  "call_data": {
    "call_id": "f2b1c0a4-...",
    "caller": "+2348012345678",
    "caller_ref": "optional, only on a masked call",
    "extension": "1001",
    "decline_token": "optional",
    "decline_url": "optional"
  }
}
```

There is no `aps` dictionary, and there does not need to be: a VoIP push is not
displayed by the system, so there is nothing for `aps` to describe. The
template above reads `call_data` first and then the top level, so it also works
with a backend of your own that sends the two fields flat.

What each field is for is in
[VoIP Push Setup → what the push contains](voip-push-setup.md#part-7-what-the-push-contains).

## Android — FCM data messages (optional)

The SDK's foreground service keeps the SIP socket open, which is usually
enough on Android. If you want push wake-up anyway (e.g. for Doze-mode
resilience), use FCM **data messages** (not notification messages) and
trigger `register()` from the background handler:

The server sends the same fields as the iOS payload, one level up, as a
data-only message. It does not send SIP credentials, and no push ever should:
read those from where the app already keeps them.

```ts
import messaging from '@react-native-firebase/messaging';
import { CallEngine } from '@nativetalkcommunications/react-native-call-sdk';
import { loadStoredSipConfig } from './your-storage';

messaging().setBackgroundMessageHandler(async (remote) => {
  if (!remote.data?.call_id) return;

  // From app storage, not from the push. A handler that fetches credentials
  // over the network races the call it is trying to answer, and loses often
  // enough to matter.
  const sip = await loadStoredSipConfig();
  if (!sip) return;

  CallEngine.startNativeServices();
  CallEngine.register(sip);
});
```

Android has no equivalent of Apple's rule about reporting the call, so a
handler that returns early here costs one missed call rather than every future
one.

## Testing push end-to-end

There's no shortcut here — you need a real device and a working server.
For iOS, [Knuff](https://github.com/KnuffApp/Knuff) is good for ad-hoc VoIP
push testing.
