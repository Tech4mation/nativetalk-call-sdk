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
 * This is useful for VoIP apps that need to pause or decline SIP calls while
 * a cellular call is active. It is harmless if you don't subscribe.
 *
 * Requires READ_PHONE_STATE if you want telephony updates, and READ_CONTACTS
 * if you want contact lookups. Both are runtime permissions in the host app.
 */
object TelephonyMonitor {
    private const val TAG = "NativetalkCallSdk.Telephony"

    private var tm: TelephonyManager? = null
    private var rc: ReactApplicationContext? = null
    private var appCtx: Context? = null

    private var cb: TelephonyCallback? = null
    private var oldListener: PhoneStateListener? = null

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

            if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE)
                != PackageManager.PERMISSION_GRANTED
            ) {
                Log.w(TAG, "READ_PHONE_STATE not granted; telephony observer inactive")
                return
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val callback = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                    override fun onCallStateChanged(state: Int) {
                        handleCallStateChange(state, null)
                    }
                }
                cb = callback
                tm?.registerTelephonyCallback(context.mainExecutor, callback)
            } else {
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
                if (previous == TelephonyManager.CALL_STATE_IDLE) {
                    pendingCallDirection = "outgoing"
                }
            }
            TelephonyManager.CALL_STATE_IDLE -> {
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
