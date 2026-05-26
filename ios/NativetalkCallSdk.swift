import AVFoundation
import Foundation
import React
import linphonesw

/**
 * Native bridge exposed to JavaScript as `NativeModules.NativetalkCallSdk`.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  Mental model
 * ──────────────────────────────────────────────────────────────────────────
 *
 *  This class owns ONE Linphone `Core` instance per app lifecycle. The Core
 *  is the SIP/RTP engine; we just drive it and forward its events back to
 *  JS via `sendEvent(withName:body:)`.
 *
 *  Unlike Android, iOS doesn't run our own foreground service for calls —
 *  Apple wants CallKit to own that UX. So this class is purely a bridge:
 *
 *      JS  ── NativeModules.NativetalkCallSdk.dial("…") ──►  this class
 *      this class  ── core.inviteAddress(…) ──►  Linphone
 *      Linphone  ── onCallStateChanged ──►  NativetalkCoreDelegate
 *      delegate  ── sendEvent("CallState", …) ──►  JS
 *
 *  CallKit + VoIP push wiring lives in the HOST app's AppDelegate. We
 *  expose a hook (`registerVoipToken`) so the AppDelegate can hand us the
 *  push token; everything else (PKPushRegistry, CXProvider, etc.) is the
 *  host app's responsibility. See `docs/push-notifications.md` for the
 *  full AppDelegate template.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  Threading
 * ──────────────────────────────────────────────────────────────────────────
 *  All methods run on the main queue (`requiresMainQueueSetup` returns
 *  true). Linphone's iOS binding is happy with this — it dispatches its
 *  own audio/IO threads internally. We just need to be careful that any
 *  long-running JS callback doesn't block the main thread, since that
 *  would stall both UI and call signalling.
 */
@objc(NativetalkCallSdk)
class NativetalkCallSdk: RCTEventEmitter {

  // The Linphone engine. Lazily initialised on first init() call and kept
  // alive for the rest of the app lifecycle. Optional because creation can
  // fail (rare) — in that case we log and the rest of the methods become
  // no-ops.
  private var core: Core?

  // The delegate that translates Linphone events into RN events. Held as a
  // property so it isn't deallocated while attached to the core.
  private var coreDelegate: NativetalkCoreDelegate?

  // Guards against re-entrant end() calls. Linphone takes ~500ms to fully
  // terminate; if the user double-taps the hang-up button in that window
  // we'd otherwise call terminate() twice and crash.
  fileprivate var isEndingCall = false

  // VoIP push token. Cached so we can reapply it whenever the SIP account
  // is created or refreshed — push tokens have to be attached to the
  // PROXY config, not stored globally.
  private var voipTokenHex: String?

  // RN requires this to be true if the module touches UIKit on init.
  // Linphone Core creation doesn't strictly need the main queue, but
  // CallKit / AVAudioSession do, so it's simpler to be main-queue-only.
  override static func requiresMainQueueSetup() -> Bool { true }

  // Events we promise to emit. RN throws at runtime if we emit any name
  // that isn't in this list.
  override func supportedEvents() -> [String]! {
    return ["RegistrationChanged", "CallIncoming", "CallState", "CallEnded"]
  }

  // MARK: - AVAudioSession dance
  //
  // iOS audio is configured via a global "audio session" object. The order
  // matters:
  //   1. setCategory   — what KIND of audio are we using (playAndRecord =
  //                       full-duplex voice call).
  //   2. setMode       — what specific profile (voiceChat enables AGC, AEC,
  //                       and Bluetooth HFP routing).
  //   3. setActive     — actually claim the audio hardware.
  //
  // CallKit will activate the audio session automatically when the call
  // connects, but for outgoing calls we need to bootstrap it ourselves so
  // Linphone has something to write into.

  private func startAudioSession() {
    let s = AVAudioSession.sharedInstance()
    try? s.setCategory(.playAndRecord, options: [.allowBluetooth, .defaultToSpeaker])
    try? s.setMode(.voiceChat)
    try? s.setActive(true)
  }

  // Reapply the audio session if something else (e.g. AVAudioPlayer for a
  // notification sound) has changed it under us. The `isOtherAudioPlaying`
  // guard avoids interrupting Apple Music / podcast playback unnecessarily —
  // CallKit's audio activation will handle that case more gracefully than
  // our manual override.
  private func ensureAudioSessionActive() {
    let s = AVAudioSession.sharedInstance()
    guard !s.isOtherAudioPlaying else { return }
    do {
      if s.category != .playAndRecord {
        try s.setCategory(.playAndRecord, options: [.allowBluetooth, .defaultToSpeaker])
      }
      if s.mode != .voiceChat { try s.setMode(.voiceChat) }
      if !s.isOtherAudioPlaying { try s.setActive(true) }
    } catch {
      NSLog("NativetalkCallSdk: failed to ensure audio session: \(error)")
    }
  }

  // MARK: - UI tone (DTMF feedback for the dial-pad)
  //
  // Why we don't use the system AudioServicesPlaySystemSound: it's hardcoded
  // to play through the loudspeaker and ignores the audio session's
  // routing, which is wrong on a Bluetooth headset. Generating the tones
  // ourselves through AVAudioEngine respects the current output route.
  //
  // The DTMF dual-tone frequencies are an ITU standard — each key is the
  // sum of one low-group and one high-group sine wave. The classic Bell
  // System matrix:
  //
  //               1209Hz   1336Hz   1477Hz
  //       697Hz     1        2        3
  //       770Hz     4        5        6
  //       852Hz     7        8        9
  //       941Hz     *        0        #

  private var toneEngine: AVAudioEngine?
  private var toneNode: AVAudioSourceNode?

  private let dtmfMap: [String: (Double, Double)] = [
    "1": (697, 1209), "2": (697, 1336), "3": (697, 1477),
    "4": (770, 1209), "5": (770, 1336), "6": (770, 1477),
    "7": (852, 1209), "8": (852, 1336), "9": (852, 1477),
    "*": (941, 1209), "0": (941, 1336), "#": (941, 1477),
  ]

  @objc(playKeyTone:)
  func playKeyTone(_ digit: NSString) {
    let d = String(digit)
    guard let (f1, f2) = dtmfMap[d] else { return }

    // Lazy-init the engine on first key press to avoid paying ~10ms of
    // setup cost during app launch when most users never touch the dialer.
    if toneEngine == nil { toneEngine = AVAudioEngine() }

    // If the user mashes the keypad, tear down the previous tone node
    // before starting a new one — overlapping nodes cause clicks/pops.
    if let node = toneNode {
      node.removeTap(onBus: 0)
      toneEngine?.detach(node)
      toneNode = nil
    }

    // 48 kHz matches what most iOS hardware uses internally — using the
    // device's native rate avoids an extra sample-rate conversion stage.
    let sr = 48000.0
    var t: Double = 0
    let dt = 1.0 / sr
    let amp: Float = 0.18      // gentle "click" volume, not full DTMF
    let twoPi = 2.0 * Double.pi

    // AVAudioSourceNode lets us synthesise samples in a render callback.
    // We sum the two sines (each with half amplitude so the sum stays
    // within ±1.0) and write the same value to every channel.
    let node = AVAudioSourceNode { _, _, frameCount, audioBufferList -> OSStatus in
      let abl = UnsafeMutableAudioBufferListPointer(audioBufferList)
      for frame in 0..<Int(frameCount) {
        let sample = sin(twoPi * f1 * t) + sin(twoPi * f2 * t)
        t += dt
        let v = Float(sample * 0.5) * amp
        for buf in abl {
          let ptr = buf.mData!.assumingMemoryBound(to: Float.self)
          ptr[frame] = v
        }
      }
      return noErr
    }

    let format = AVAudioFormat(standardFormatWithSampleRate: sr, channels: 1)!
    toneEngine?.attach(node)
    toneEngine?.connect(node, to: toneEngine!.mainMixerNode, format: format)

    do {
      if !(toneEngine?.isRunning ?? false) { try toneEngine?.start() }
    } catch {
      NSLog("DTMF: engine start failed \(error)")
      return
    }
    toneNode = node

    // 120ms beep — matches Apple's stock dialer feel. Any longer and it
    // starts to feel laggy; any shorter and it sounds like a click.
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { [weak self] in
      guard let self = self, let n = self.toneNode else { return }
      self.toneEngine?.disconnectNodeInput(n)
      self.toneEngine?.detach(n)
      self.toneNode = nil
    }
  }

  // MARK: - Core lifecycle

  /**
   * Boot Linphone. Idempotent — calling twice is a no-op.
   *
   * Called automatically by `register()` if it sees no core yet, so most
   * apps never need to invoke this directly. The `cfg` param is reserved
   * for future use (e.g. log level, codec preferences); currently ignored.
   *
   * `pushNotificationEnabled = true` tells Linphone we want it to use the
   * VoIP push token attached to the proxy config. We still need the host
   * app to wire PushKit and feed us the token via `registerVoipToken`.
   */
  @objc(init:)
  func `init`(_ cfg: NSDictionary?) {
    if core != nil { return }
    startAudioSession()

    let f = Factory.Instance
    do {
      core = try f.createCore(configPath: nil, factoryConfigPath: nil, systemContext: nil)
      let delegate = NativetalkCoreDelegate(module: self)
      coreDelegate = delegate
      core?.addDelegate(delegate: delegate)
      core?.pushNotificationEnabled = true
      core?.networkReachable = true
      try core?.start()
    } catch {
      NSLog("NativetalkCallSdk: createCore/start failed: \(error)")
    }
  }

  /**
   * iOS counterpart to the Android background service.
   *
   * iOS doesn't allow long-running background services for VoIP — Apple's
   * model is "the app sleeps; VoIP push wakes it on demand". So
   * `startNativeServices` just ensures the core exists and is ready to
   * receive a push-driven re-register. The actual "service" is provided
   * by the host app's PushKit/CallKit code (see docs/push-notifications.md).
   */
  @objc(startNativeServices)
  func startNativeServices() {
    if core == nil { self.`init`(nil) }
  }

  /**
   * Soft-stop: clear all SIP accounts but keep the Core alive so a future
   * `register()` doesn't have to pay the startup cost.
   *
   * We don't fully tear down the core because doing so leaves the
   * AVAudioSession in a half-deactivated state that the next call has to
   * recover from. Better to keep it warm.
   */
  @objc(stopNativeServices:)
  func stopNativeServices(_ logout: Bool) {
    core?.clearAccounts()
    core?.clearProxyConfig()
    core?.clearAllAuthInfo()
  }

  // MARK: - Registration

  /**
   * Register a SIP account, replacing any previous one.
   *
   * Unlike the Android side (which has a "same user → skip wipe" fast
   * path), we always wipe on iOS. The reason: iOS apps re-mount this
   * module on every cold start, and they typically only call register()
   * once per session, so the wipe cost is negligible. Keeping the code
   * simpler is the better tradeoff here.
   *
   * Account params are the modern Linphone API for registration (vs. the
   * legacy ProxyConfig). They support push notification config in a way
   * proxy configs don't, which matters on iOS where VoIP push is the
   * primary delivery mechanism.
   */
  @objc(register:)
  func register(_ acc: NSDictionary) {
    if core == nil { self.`init`(nil) }
    guard let core = core else { return }

    let username = acc["username"] as? String ?? ""
    let password = acc["password"] as? String ?? ""
    let domain = acc["domain"] as? String ?? ""
    let transport = (acc["transport"] as? String)?.lowercased()

    do {
      // Wipe any previous registration. See Android CoreManager's
      // wipeAllAccounts() docs for why this matters.
      core.clearAccounts()
      core.clearProxyConfig()
      core.clearAllAuthInfo()

      // Auth info = "if anyone challenges us with a 401, here's the
      // password". Keyed by username + domain.
      let auth = try Factory.Instance.createAuthInfo(
        username: username, userid: nil, passwd: password,
        ha1: nil, realm: nil, domain: domain
      )
      core.addAuthInfo(info: auth)

      // Identity = our SIP address. Server = where to send REGISTER.
      // These are often the same hostname but conceptually distinct.
      let identityAddr = try Factory.Instance.createAddress(addr: "sip:\(username)@\(domain)")
      let serverAddr = try Factory.Instance.createAddress(addr: "sip:\(domain)")

      // Transport: TLS (encrypted), TCP (plain reliable), UDP (plain
      // best-effort). Default is UDP if unspecified — but most modern
      // PBXs require TCP or TLS for security.
      if let t = transport {
        switch t {
        case "tls": try serverAddr.setTransport(newValue: .Tls)
        case "tcp": try serverAddr.setTransport(newValue: .Tcp)
        default: try serverAddr.setTransport(newValue: .Udp)
        }
      }

      let params = try core.createAccountParams()
      try params.setIdentityaddress(newValue: identityAddr)
      try params.setServeraddress(newValue: serverAddr)
      params.pushNotificationAllowed = true   // tell the server we accept push
      params.registerEnabled = true

      // Attach any cached VoIP push token. If we don't have one yet
      // (token comes from PushKit asynchronously), it'll be applied later
      // via registerVoipToken().
      if let token = self.voipTokenHex, !token.isEmpty {
        params.pushNotificationConfig?.param = token
      }

      let account = try core.createAccount(params: params)
      try core.addAccount(account: account)
      core.defaultAccount = account
    } catch {
      NSLog("NativetalkCallSdk: register() failed: \(error)")
    }
  }

  @objc(refreshRegisters)
  func refreshRegisters() {
    try? core?.refreshRegisters()
  }

  @objc(setRegisterEnabled:)
  func setRegisterEnabled(_ on: Bool) {
    guard let core = core, let proxy = core.defaultProxyConfig else { return }
    proxy.registerEnabled = on
    try? core.refreshRegisters()
  }

  @objc(registerVoipToken:)
  func registerVoipToken(_ tokenHex: NSString) {
    self.voipTokenHex = tokenHex as String
    guard let core = core, let account = core.defaultAccount else { return }
    if let newParams = account.params?.clone() {
      newParams.pushNotificationConfig?.param = self.voipTokenHex
      account.params = newParams
      try? core.refreshRegisters()
    }
  }

  @objc(getRegistrationStatus:rejecter:)
  func getRegistrationStatus(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard let core = core else {
      reject("NO_CORE", "Core not initialized", nil)
      return
    }
    guard let proxy = core.defaultProxyConfig else {
      resolve([
        "state": "none",
        "message": "",
        "username": "",
        "domain": "",
        "displayName": "",
      ])
      return
    }
    let addr = proxy.identityAddress
    let diag: String = {
      if let info = proxy.errorInfo, let phrase = info.phrase, !phrase.isEmpty { return phrase }
      return ""
    }()
    let state: String = {
      switch proxy.state {
      case .None: return "none"
      case .Progress: return "progress"
      case .Ok: return "ok"
      case .Cleared: return "cleared"
      case .Failed: return "failed"
      @unknown default: return "unknown"
      }
    }()
    resolve([
      "state": state,
      "message": diag,
      "username": addr?.username ?? "",
      "domain": addr?.domain ?? "",
      "displayName": addr?.displayName ?? "",
    ])
  }

  // MARK: - Call control

  @objc(call:)
  func call(_ sipUri: String) {
    guard let core = core,
          let addr = try? Factory.Instance.createAddress(addr: sipUri) else { return }
    _ = core.inviteAddress(addr: addr)
  }

  @objc(answer)
  func answer() {
    do { try core?.currentCall?.accept() } catch {
      NSLog("NativetalkCallSdk: answer() failed: \(error)")
    }
  }

  /**
   * Reject an incoming call with a specific SIP response code.
   *
   * The reason determines what the CALLER sees:
   *   - .Busy (486)                  → "User busy" — often → voicemail
   *   - .NotAcceptable (406)         → "Not acceptable here"
   *   - .TemporarilyUnavailable(480) → "Temporarily unavailable"
   *   - .Declined (default)          → "Call declined"
   *
   * Most apps want .Busy for "don't disturb me right now, take a message"
   * or .Declined for "I'm choosing not to answer".
   *
   * The state check matters: `decline()` is only valid for incoming calls
   * that haven't yet been accepted. If we somehow got into this method
   * with an outgoing or already-connected call, we fall back to
   * `terminate()` which works in any state.
   */
  @objc(decline:)
  func decline(_ reasonStr: NSString?) {
    ensureAudioSessionActive()
    guard let call = core?.currentCall else { return }

    let r: Reason
    switch (reasonStr as String?)?.lowercased() {
    case "busy", "486": r = .Busy
    case "notacceptable", "406": r = .NotAcceptable
    case "temporarilyunavailable", "480": r = .TemporarilyUnavailable
    default: r = .Declined
    }

    switch call.state {
    case .IncomingReceived, .IncomingEarlyMedia, .PushIncomingReceived:
      do { try call.decline(reason: r) }
      catch { NSLog("NativetalkCallSdk: decline() failed: \(error)") }
    default:
      // Not a ringing call — `decline` would throw. Fall back to terminate.
      do { try call.terminate() }
      catch { NSLog("NativetalkCallSdk: terminate() (fallback) failed: \(error)") }
    }
  }

  /**
   * End the active call (any direction, any state).
   *
   * `isEndingCall` guards against re-entrancy: Linphone takes ~500ms to
   * fully tear down a call, and the user double-tapping the hang-up
   * button in that window would call terminate() twice and crash. The
   * guard is cleared automatically by [NativetalkCoreDelegate] when the
   * call reaches a terminal state.
   *
   * The state-aware dispatch (`decline` for ringing calls, `terminate`
   * for everything else) is required because Linphone disallows
   * `terminate()` on a call that hasn't been answered.
   */
  @objc(end)
  func end() {
    guard let call = core?.currentCall, !isEndingCall else { return }
    isEndingCall = true
    do {
      switch call.state {
      case .IncomingReceived, .PushIncomingReceived, .IncomingEarlyMedia:
        try call.decline(reason: .Declined)
      default:
        try call.terminate()
      }
    } catch {
      isEndingCall = false
      NSLog("NativetalkCallSdk: end() failed: \(error)")
    }
  }

  @objc(hangup)
  func hangup() { end() }

  @objc(mute:)
  func mute(_ on: Bool) { core?.micEnabled = !on }

  @objc(speaker:)
  func speaker(_ on: Bool) {
    let s = AVAudioSession.sharedInstance()
    try? s.overrideOutputAudioPort(on ? .speaker : .none)
  }

  @objc(sendDtmf:)
  func sendDtmf(_ d: String) {
    do {
      guard let byte = d.utf8.first else { return }
      let ch = CChar(bitPattern: byte)
      try core?.currentCall?.sendDtmf(dtmf: ch)
    } catch {
      NSLog("NativetalkCallSdk: sendDtmf() failed: \(error)")
    }
  }

  @objc(hold)
  func hold() {
    do { try core?.currentCall?.pause() } catch {
      NSLog("NativetalkCallSdk: hold() failed: \(error)")
    }
  }

  @objc(resume)
  func resume() {
    do { try core?.currentCall?.resume() } catch {
      NSLog("NativetalkCallSdk: resume() failed: \(error)")
    }
  }

  // MARK: - Call logs

  private func sipUserPart(_ uri: String) -> String {
    if let at = uri.firstIndex(of: "@") {
      let start = uri.hasPrefix("sip:") ? uri.index(uri.startIndex, offsetBy: 4) : uri.startIndex
      return String(uri[start..<at])
    }
    return uri.replacingOccurrences(of: "sip:", with: "")
  }

  private func mmss(_ seconds: Int) -> String {
    let m = seconds / 60
    let s = seconds % 60
    return String(format: "%02d:%02d", m, s)
  }

  private func guessCallType(direction: String, called: String, mySipUser: String?) -> String {
    if called.count <= 3 { return "LOCAL" }
    if direction == "inbound", let me = mySipUser, called == me { return "DID" }
    return "STANDARD"
  }

  private func dispositionFor(status: String) -> String {
    let s = status.lowercased()
    if s.contains("success") || s.contains("ok") { return "NORMAL_CLEARING [16]" }
    if s.contains("missed") { return "NO_USER_RESPONSE [18]" }
    if s.contains("aborted") || s.contains("declined") || s.contains("cancel") {
      return "ORIGINATOR_CANCEL [487]"
    }
    if s.contains("busy") { return "USER_BUSY [17]" }
    return "NORMAL_CLEARING [16]"
  }

  @objc(getCallLogs:rejecter:)
  func getCallLogs(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard let logs = core?.callLogs else {
      resolve([])
      return
    }
    let df = ISO8601DateFormatter()
    var mySipUser: String? = nil
    if let me = core?.defaultAccount?.params?.identityAddress?.username, !me.isEmpty {
      mySipUser = me
    }

    var items: [[String: Any]] = []
    for (idx, log) in logs.enumerated() {
      let fromRaw = log.fromAddress?.asStringUriOnly() ?? log.fromAddress?.asString() ?? ""
      let toRaw = log.toAddress?.asStringUriOnly() ?? log.toAddress?.asString() ?? ""
      let fromNum = sipUserPart(fromRaw)
      let toNum = sipUserPart(toRaw)

      let direction: String = {
        let s = String(describing: log.dir).lowercased()
        if s.contains("incoming") { return "inbound" }
        if s.contains("outgoing") { return "outbound" }
        return s
      }()

      let startISO = df.string(from: Date(timeIntervalSince1970: TimeInterval(log.startDate)))
      let callType = guessCallType(direction: direction, called: toNum, mySipUser: mySipUser)
      let disp = dispositionFor(status: String(describing: log.status))
      let durationStr = mmss(Int(log.duration))
      let destination = (callType == "LOCAL") ? "Local" : ""
      let idVal: Int = {
        if let cid = log.callId { return abs(cid.hashValue) }
        return 100000 + idx
      }()

      items.append([
        "id": idVal,
        "call_start": startISO,
        "call_type": callType,
        "caller_id": "\(fromNum) <\(fromNum)>",
        "call_direction": direction,
        "called_number": toNum,
        "disposition": disp,
        "debit": "0.0000",
        "duration": durationStr,
        "destination": destination,
        "sip_user": mySipUser ?? "",
        "created_at": startISO,
        "updated_at": startISO,
      ])
    }
    resolve(items)
  }

  deinit {
    if let d = coreDelegate { core?.removeDelegate(delegate: d) }
    if let node = toneNode {
      toneEngine?.disconnectNodeInput(node)
      toneEngine?.detach(node)
    }
    toneNode = nil
    toneEngine?.stop()
    toneEngine = nil
  }
}

// MARK: - Delegate that pipes Linphone events into RN events.

class NativetalkCoreDelegate: CoreDelegate {
  private weak var module: NativetalkCallSdk?

  init(module: NativetalkCallSdk) {
    self.module = module
  }

  func onCallStateChanged(core: Core, call: Call, state: Call.State, message: String) {
    let stateStr = String(describing: state)
    module?.sendEvent(withName: "CallState", body: ["state": stateStr, "message": message])

    switch state {
    case .IncomingReceived, .PushIncomingReceived, .IncomingEarlyMedia:
      let addr = call.remoteAddress
      let display = addr?.displayName ?? ""
      let username = addr?.username ?? ""
      let uri = addr?.asStringUriOnly() ?? addr?.asString() ?? ""
      let short = (!display.isEmpty && display.lowercased() != "anonymous") ? display : username

      module?.sendEvent(
        withName: "CallIncoming",
        body: [
          "from": short,
          "displayName": display,
          "username": username,
          "uri": uri,
          "callId": call.callLog?.callId ?? "",
        ])

    case .End, .Released, .Error:
      module?.isEndingCall = false
      module?.sendEvent(withName: "CallEnded", body: [:])

    default:
      break
    }
  }

  func onRegistrationStateChanged(
    core: Core, proxyConfig: ProxyConfig, state: RegistrationState, message: String
  ) {
    let s: String = {
      switch state {
      case .None: return "none"
      case .Progress: return "progress"
      case .Ok: return "ok"
      case .Cleared: return "cleared"
      case .Failed: return "failed"
      @unknown default: return "unknown"
      }
    }()
    module?.sendEvent(
      withName: "RegistrationChanged",
      body: ["state": s, "message": message])
  }
}
