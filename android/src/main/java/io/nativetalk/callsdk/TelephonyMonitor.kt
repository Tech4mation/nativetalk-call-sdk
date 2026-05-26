package io.nativetalk.callsdk

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.ContactsContract
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Observes the device's native GSM/cellular call state and surfaces the
 * transitions to JS as `TMPhoneCallState` and `TMPhoneCallInfo` events.
 *
 * Why this matters: a VoIP app needs to know when the user is on a regular
 * phone call so it can decline the SIP call gracefully instead of letting
 * Linphone fight the cellular audio for the mic.
 *
 * No iOS counterpart — Apple doesn't expose cellular call state to apps;
 * CallKit handles the coexistence automatically.
 *
 * Permission model: requires READ_PHONE_STATE for telephony updates and
 * READ_CONTACTS for caller-name lookups. Both are host-app responsibility
 * — if not granted, this monitor silently no-ops.
 */
object TelephonyMonitor {
    private const val TAG = "NativetalkCallSdk.Telephony"

    private var tm: TelephonyManager? = null
    private var rc: ReactApplicationContext? = null
    private var appCtx: Context? = null

    // Two listener fields because Android 12+ deprecated PhoneStateListener
    // in favour of TelephonyCallback. We use whichever is available at
    // runtime (see [start]).
    private var cb: TelephonyCallback? = null
    private var oldListener: PhoneStateListener? = null

    // Cached info about the current call. We stash these here because the
    // direction and number can arrive in separate callbacks (RINGING then
    // OFFHOOK) — we have to remember the earlier value to emit a complete
    // event when the later one fires.
    private var currentCallState = TelephonyManager.CALL_STATE_IDLE
    private var pendingCallNumber: String? = null
    private var pendingCallDirection: String? = null

    private val handler = Handler(Looper.getMainLooper())

    fun attachReact(reactContext: ReactApplicationContext) {
        rc = reactContext
    }

    fun detachReact() {
        rc = null
    }

    fun start(context: Context) {
        try {
            appCtx = context.applicationContext
            tm = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager

            // Fail soft: without READ_PHONE_STATE the OS silently delivers
            // no events, so registering listeners would just waste handles.
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE)
                != PackageManager.PERMISSION_GRANTED
            ) {
                Log.w(TAG, "READ_PHONE_STATE not granted; telephony observer inactive")
                return
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // API 31+: TelephonyCallback. Note that the modern API
                // does NOT pass the phone number to onCallStateChanged
                // (privacy hardening) — we fill it in from CallScreeningService
                // when available.
                val callback = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                    override fun onCallStateChanged(state: Int) {
                        handleCallStateChange(state, null)
                    }
                }
                cb = callback
                tm?.registerTelephonyCallback(context.mainExecutor, callback)
            } else {
                // Legacy PhoneStateListener (< API 31). Deprecated but still
                // works and DOES include the phone number directly.
                @Suppress("DEPRECATION")
                val listener = object : PhoneStateListener() {
                    override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                        handleCallStateChange(state, phoneNumber)
                    }
                }
                oldListener = listener
                @Suppress("DEPRECATION")
                tm?.listen(listener, PhoneStateListener.LISTEN_CALL_STATE)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start telephony monitoring", e)
        }
    }

    fun stop() {
        try {
            handler.removeCallbacksAndMessages(null)
            tm?.let { mgr ->
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    cb?.let { mgr.unregisterTelephonyCallback(it) }
                    cb = null
                } else {
                    @Suppress("DEPRECATION")
                    oldListener?.let { mgr.listen(it, PhoneStateListener.LISTEN_NONE) }
                    oldListener = null
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping telephony monitoring", e)
        }
    }

    fun setPendingCallInfo(number: String?, direction: String) {
        pendingCallNumber = number
        pendingCallDirection = direction
    }

    private fun handleCallStateChange(newState: Int, phoneNumber: String?) {
        val previous = currentCallState
        currentCallState = newState

        if (!phoneNumber.isNullOrEmpty() && phoneNumber != pendingCallNumber) {
            pendingCallNumber = phoneNumber
        }

        when (newState) {
            TelephonyManager.CALL_STATE_OFFHOOK -> {
                // IDLE → OFFHOOK with no preceding RINGING means we just
                // placed an outgoing call. RINGING → OFFHOOK would mean we
                // answered an incoming one, and pendingCallDirection was
                // already set by the RINGING handler.
                if (previous == TelephonyManager.CALL_STATE_IDLE) {
                    pendingCallDirection = "outgoing"
                }
            }
            TelephonyManager.CALL_STATE_IDLE -> {
                // Clear cached call info AFTER a 2s delay so any late-arriving
                // CallScreeningService callback (which can lag the state
                // change by 1–2s on some OEMs) still has access to it.
                handler.postDelayed({
                    pendingCallNumber = null
                    pendingCallDirection = null
                }, 2000)
            }
        }
        emitState(newState)
    }

    fun emitToReact(event: String, payload: WritableMap) {
        try {
            val ctx = rc
            if (ctx == null || !ctx.hasActiveCatalystInstance()) return
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit(event, payload)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to emit '$event'", e)
        }
    }

    fun tryLookupContact(number: String): WritableMap? {
        if (number.isBlank()) return null
        val ctx = appCtx ?: return null
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CONTACTS)
            != PackageManager.PERMISSION_GRANTED
        ) return null

        try {
            val uri = Uri.withAppendedPath(
                ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                Uri.encode(number)
            )
            val cols = arrayOf(
                ContactsContract.PhoneLookup.DISPLAY_NAME,
                ContactsContract.PhoneLookup.PHOTO_THUMBNAIL_URI
            )
            ctx.contentResolver.query(uri, cols, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    return Arguments.createMap().apply {
                        putString("name", cursor.getString(0))
                        putString("photo", cursor.getString(1))
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Contact lookup failed for $number", e)
        }
        return null
    }

    private fun emitState(state: Int) {
        val stateName = stateName(state)
        try {
            val ctx = rc
            if (ctx == null || !ctx.hasActiveCatalystInstance()) return
            val map = Arguments.createMap().apply {
                putString("state", stateName)
                putInt("code", state)
                putDouble("timestamp", System.currentTimeMillis().toDouble())
            }
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit("TMPhoneCallState", map)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to emit telephony state", e)
        }
    }

    private fun stateName(state: Int) = when (state) {
        TelephonyManager.CALL_STATE_RINGING -> "ringing"
        TelephonyManager.CALL_STATE_OFFHOOK -> "offhook"
        TelephonyManager.CALL_STATE_IDLE -> "idle"
        else -> "unknown_$state"
    }
}
