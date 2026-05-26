import AVFoundation
import Foundation
import React
import linphonesw

/**
 * Native bridge exposed to JavaScript as `NativeModules.NativetalkCallSdk`.
 *
 * Mirrors the JS API: init, register, call, answer, decline, end, mute,
 * speaker, hold, resume, sendDtmf, playKeyTone, getCallLogs,
 * getRegistrationStatus. CallKit and VoIP-push integration is left to the
 * host app — see `docs/ios-setup.md`.
 */
@objc(NativetalkCallSdk)
class NativetalkCallSdk: RCTEventEmitter {

  private var core: Core?
  private var coreDelegate: NativetalkCoreDelegate?
  fileprivate var isEndingCall = false
  private var voipTokenHex: String?

  override static func requiresMainQueueSetup() -> Bool { true }

  override func supportedEvents() -> [String]! {
    return ["RegistrationChanged", "CallIncoming", "CallState", "CallEnded"]
  }

  // MARK: - Audio session helpers

  private func startAudioSession() {
    let s = AVAudioSession.sharedInstance()
    try? s.setCategory(.playAndRecord, options: [.allowBluetooth, .defaultToSpeaker])
    try? s.setMode(.voiceChat)
    try? s.setActive(true)
  }

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

    if toneEngine == nil { toneEngine = AVAudioEngine() }
    if let node = toneNode {
      node.removeTap(onBus: 0)
      toneEngine?.detach(node)
      toneNode = nil
    }

    let sr = 48000.0
    var t: Double = 0
    let dt = 1.0 / sr
    let amp: Float = 0.18
    let twoPi = 2.0 * Double.pi

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

    DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { [weak self] in
      guard let self = self, let n = self.toneNode else { return }
      self.toneEngine?.disconnectNodeInput(n)
      self.toneEngine?.detach(n)
      self.toneNode = nil
    }
  }

  // MARK: - Core lifecycle

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

  @objc(startNativeServices)
  func startNativeServices() {
    // iOS uses CallKit + VoIP push from the host app — no background service.
    if core == nil { self.`init`(nil) }
  }

  @objc(stopNativeServices:)
  func stopNativeServices(_ logout: Bool) {
    // Soft-stop: drop accounts but keep core alive so future register() works.
    core?.clearAccounts()
    core?.clearProxyConfig()
    core?.clearAllAuthInfo()
  }

  // MARK: - Registration

  @objc(register:)
  func register(_ acc: NSDictionary) {
    if core == nil { self.`init`(nil) }
    guard let core = core else { return }

    let username = acc["username"] as? String ?? ""
    let password = acc["password"] as? String ?? ""
    let domain = acc["domain"] as? String ?? ""
    let transport = (acc["transport"] as? String)?.lowercased()

    do {
      core.clearAccounts()
      core.clearProxyConfig()
      core.clearAllAuthInfo()

      let auth = try Factory.Instance.createAuthInfo(
        username: username, userid: nil, passwd: password,
        ha1: nil, realm: nil, domain: domain
      )
      core.addAuthInfo(info: auth)

      let identityAddr = try Factory.Instance.createAddress(addr: "sip:\(username)@\(domain)")
      let serverAddr = try Factory.Instance.createAddress(addr: "sip:\(domain)")
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
      params.pushNotificationAllowed = true
      params.registerEnabled = true
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
      do { try call.terminate() }
      catch { NSLog("NativetalkCallSdk: terminate() (fallback) failed: \(error)") }
    }
  }

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
