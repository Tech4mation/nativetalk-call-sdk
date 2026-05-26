package io.nativetalk.callsdk

import android.content.Intent
import android.media.AudioManager
import android.media.ToneGenerator
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.linphone.core.Core
import org.linphone.core.ProxyConfig
import org.linphone.core.RegistrationState

/**
 * Native bridge exposed to JavaScript as `NativeModules.NativetalkCallSdk`.
 *
 * Intentionally thin: every @ReactMethod is a 1-line delegate to
 * [CoreManager] or another singleton. Keeping the engine in [CoreManager]
 * (not here) means push-driven background services can drive calls before
 * React has even mounted.
 *
 * The string `"NativetalkCallSdk"` is the contract with JS — must exactly
 * match `NativeModules.NativetalkCallSdk` and `@objc(NativetalkCallSdk)` on
 * iOS. Renaming this breaks the bridge silently.
 */
class NativetalkCallSdkModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "NativetalkCallSdk"
        private const val TAG = "NativetalkCallSdk"
    }

    // Lazily-created tone generator. Allocating a ToneGenerator pre-warms
    // the audio HAL (~50ms hit), so we defer until the first key press.
    private var dtmfTone: ToneGenerator? = null

    override fun getName(): String = NAME

    // === Lifecycle ===

    @ReactMethod
    fun init(cfg: ReadableMap?, promise: Promise) {
        try {
            CoreManager.attachReact(reactContext)
            TelephonyMonitor.attachReact(reactContext)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("INIT_FAILED", e)
        }
    }

    @ReactMethod
    fun startNativeServices() {
        CoreManager.ensureStarted(reactContext)
        BackgroundService.startService(reactContext)
    }

    @ReactMethod
    fun stopNativeServices(logout: Boolean) {
        if (logout) BackgroundService.shouldRestart = false
        reactContext.stopService(Intent(reactContext, CallService::class.java))
        BackgroundService.stopService(reactContext)
        CoreManager.stop()
    }

    // === Registration ===

    @ReactMethod
    fun register(acc: ReadableMap) {
        CoreManager.ensureStarted(reactContext)
        CoreManager.register(
            acc.getString("username") ?: "",
            acc.getString("password") ?: "",
            acc.getString("domain") ?: "",
            acc.getString("transport") ?: "tcp"
        )
    }

    @ReactMethod
    fun refreshRegisters() {
        CoreManager.refreshRegisters()
    }

    @ReactMethod
    fun setRegisterEnabled(on: Boolean) {
        CoreManager.setRegisterEnabled(on)
    }

    @ReactMethod
    fun getRegistrationStatus(promise: Promise) {
        try {
            val core: Core? = CoreManager.core()
            val pc: ProxyConfig? = core?.defaultProxyConfig
            val addr = pc?.identityAddress

            val diag: String = try {
                pc?.errorInfo?.phrase ?: pc?.errorInfo?.toString() ?: ""
            } catch (_: Throwable) { "" }

            val map = Arguments.createMap().apply {
                putString("state", regStateToString(pc?.state))
                putString("message", diag)
                putString("username", addr?.username ?: "")
                putString("domain", addr?.domain ?: "")
                putString("displayName", addr?.displayName ?: "")
            }
            promise.resolve(map)
        } catch (e: Throwable) {
            promise.reject("E_STATUS", "Failed to read registration status", e)
        }
    }

    // === Call control ===

    @ReactMethod fun call(sipUri: String) = CoreManager.call(sipUri)
    @ReactMethod fun answer() = CoreManager.answer()
    @ReactMethod fun decline(reason: String?) = CoreManager.decline()
    @ReactMethod fun end() = CoreManager.end()
    @ReactMethod fun hangup() = end()
    @ReactMethod fun mute(on: Boolean) = CoreManager.mute(on)
    @ReactMethod fun speaker(on: Boolean) = CoreManager.speaker(on)
    @ReactMethod fun sendDtmf(d: String) = CoreManager.sendDtmf(d)
    @ReactMethod fun hold() = CoreManager.hold()
    @ReactMethod fun resume() = CoreManager.resume()

    // === Call logs ===

    @ReactMethod
    fun getCallLogs(promise: Promise) {
        try {
            promise.resolve(CoreManager.getCallLogs())
        } catch (e: Exception) {
            Log.e(TAG, "getCallLogs failed", e)
            promise.reject("GET_CALL_LOGS_FAILED", e.message, e)
        }
    }

    // === Misc ===

    /**
     * Plays a local DTMF UI tone — for tactile feedback when the user taps
     * the dial-pad. Does NOT send anything over an active call (that's
     * `sendDtmf`).
     *
     * Unlike the iOS side (which synthesises tones manually via
     * AVAudioEngine), Android's stock `ToneGenerator` already routes
     * correctly through the voice-call audio stream, including BT headsets.
     * The volume parameter (60/100) is moderate — full volume sounds
     * harsh when held to the ear.
     */
    @ReactMethod
    fun playKeyTone(d: String) {
        if (dtmfTone == null) {
            dtmfTone = ToneGenerator(AudioManager.STREAM_VOICE_CALL, 60)
        }
        // Each key has a dedicated constant (TONE_DTMF_0..9, _S for *, _P
        // for #). Anything else falls back to a generic beep so a typo
        // produces SOMETHING audible rather than silence.
        val tone = when (d) {
            "0" -> ToneGenerator.TONE_DTMF_0
            "1" -> ToneGenerator.TONE_DTMF_1
            "2" -> ToneGenerator.TONE_DTMF_2
            "3" -> ToneGenerator.TONE_DTMF_3
            "4" -> ToneGenerator.TONE_DTMF_4
            "5" -> ToneGenerator.TONE_DTMF_5
            "6" -> ToneGenerator.TONE_DTMF_6
            "7" -> ToneGenerator.TONE_DTMF_7
            "8" -> ToneGenerator.TONE_DTMF_8
            "9" -> ToneGenerator.TONE_DTMF_9
            "*" -> ToneGenerator.TONE_DTMF_S
            "#" -> ToneGenerator.TONE_DTMF_P
            else -> ToneGenerator.TONE_PROP_BEEP
        }
        // 120ms — matches the iOS DTMF feedback duration and the stock
        // dialer's feel. Anything longer feels laggy on rapid tapping.
        dtmfTone?.startTone(tone, 120)
    }

    // RN's NativeEventEmitter calls addListener/removeListeners when JS
    // subscribes/unsubscribes. Required so RN doesn't warn at runtime; we
    // don't track count because we use RCTDeviceEventEmitter directly from
    // [CoreManager], which keeps events flowing regardless of subscriber
    // count.
    @ReactMethod fun addListener(event: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    // Called when RN tears down the bridge (app close, hot reload). We
    // null-out the React reference so [CoreManager.emit] becomes a no-op
    // — but the underlying Linphone core keeps running, ready for a fresh
    // React context to attach later.
    override fun onCatalystInstanceDestroy() {
        TelephonyMonitor.detachReact()
        CoreManager.detachReact()
        super.onCatalystInstanceDestroy()
    }

    private fun regStateToString(s: RegistrationState?): String = when (s) {
        RegistrationState.None -> "none"
        RegistrationState.Progress -> "progress"
        RegistrationState.Ok -> "ok"
        RegistrationState.Cleared -> "cleared"
        RegistrationState.Failed -> "failed"
        else -> "unknown"
    }
}
