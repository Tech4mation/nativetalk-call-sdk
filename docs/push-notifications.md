# Push notifications

Without push, an incoming call only arrives when the app's SIP socket is
already open. On iOS in particular, that means the app must be foregrounded
(iOS aggressively suspends sockets in the background).

This doc covers the recommended setup.

## iOS — VoIP push + CallKit

A complete `AppDelegate.swift` you can drop in:

```swift
import UIKit
import React
import React_RCTAppDelegate
import PushKit
import CallKit
import AVFoundation
import UserNotifications

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
    let config = CXProviderConfiguration(localizedName: "YourApp")
    config.supportsVideo = false
    config.maximumCallsPerCallGroup = 1
    config.supportedHandleTypes = [.phoneNumber, .generic]
    self.callKitProvider = CXProvider(configuration: config)
    self.callKitProvider?.setDelegate(self, queue: nil)

    let reg = PKPushRegistry(queue: .main)
    reg.delegate = self
    reg.desiredPushTypes = [.voIP]
    self.voipRegistry = reg
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

    guard type == .voIP, let provider = self.callKitProvider else {
      completion()
      return
    }

    // Build the CallKit update from your push payload.
    let dict = payload.dictionaryPayload
    let callData = dict["call_data"] as? [String: Any]
    let callIdString = (callData?["call_id"] as? String)
      ?? (dict["call_id"] as? String) ?? UUID().uuidString
    let caller = (callData?["caller"] as? String)
      ?? (dict["caller"] as? String) ?? "Unknown"

    let callUUID = UUID(uuidString: callIdString) ?? UUID()
    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(type: .phoneNumber, value: caller)
    update.hasVideo = false
    update.localizedCallerName = caller

    // CRITICAL: report to CallKit before this function returns.
    provider.reportNewIncomingCall(with: callUUID, update: update) { error in
      if !self.rnInitialized {
        self.initializeReactNative(launchOptions: self.deferredLaunchOptions)
      }
      completion()
    }
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

Your SIP server / signalling backend should send a VoIP push with at least:

```json
{
  "aps": { "alert": "Incoming call" },
  "call_id": "uuid-here",
  "caller": "+1234567890"
}
```

The keys `call_id` and `caller` are read by the AppDelegate template above.
Customise to match your backend.

## Android — FCM data messages (optional)

The SDK's foreground service keeps the SIP socket open, which is usually
enough on Android. If you want push wake-up anyway (e.g. for Doze-mode
resilience), use FCM **data messages** (not notification messages) and
trigger `register()` from the background handler:

```ts
import messaging from '@react-native-firebase/messaging';
import { CallEngine } from '@nativetalk/react-native-call-sdk';

messaging().setBackgroundMessageHandler(async (remote) => {
  if (remote.data?.type === 'voip_wake') {
    CallEngine.startNativeServices();
    CallEngine.register({
      username: remote.data.sip_username,
      password: remote.data.sip_password,
      domain: remote.data.sip_domain,
    });
  }
});
```

> **Don't fetch SIP credentials inside the push handler in production —
> store them encrypted in app storage and read them here. Network calls in
> background handlers are slow and unreliable.**

## Testing push end-to-end

There's no shortcut here — you need a real device and a working server.
For iOS, [Knuff](https://github.com/KnuffApp/Knuff) is good for ad-hoc VoIP
push testing.
