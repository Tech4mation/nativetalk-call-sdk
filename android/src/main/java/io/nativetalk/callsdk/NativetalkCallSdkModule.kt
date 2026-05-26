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
 * Almost every method delegates to [CoreManager]; this class is intentionally
 * thin so the call engine can be exercised even without React (e.g. from
 * background services).
 */
class NativetalkCallSdkModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "NativetalkCallSdk"
        private const val TAG = "NativetalkCallSdk"
    }

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

    @ReactMethod
    fun playKeyTone(d: String) {
        if (dtmfTone == null) {
            dtmfTone = ToneGenerator(AudioManager.STREAM_VOICE_CALL, 60)
        }
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
        dtmfTone?.startTone(tone, 120)
    }

    // Required for NativeEventEmitter — these are no-ops because we forward
    // every event via DeviceEventManagerModule.RCTDeviceEventEmitter.
    @ReactMethod fun addListener(event: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

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
