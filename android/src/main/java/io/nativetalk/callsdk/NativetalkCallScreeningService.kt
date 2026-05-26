package io.nativetalk.callsdk

import android.os.Build
import android.telecom.Call
import android.telecom.CallScreeningService
import android.util.Log
import com.facebook.react.bridge.Arguments

/**
 * Optional call-screening service.
 *
 * Apps that want to be notified about every inbound/outbound device call
 * (e.g. to decide whether to suppress a competing VoIP call) must set this
 * package as the user's call-screener via
 * `TelecomManager.requestRoleOrSomething(ROLE_CALL_SCREENING)`. Otherwise
 * the OS never invokes this class — it's dormant by default.
 *
 * Counterpart: [TelephonyMonitor] watches READ_PHONE_STATE-style call state.
 * This service receives richer per-call metadata BEFORE the call rings.
 */
class NativetalkCallScreeningService : CallScreeningService() {
    companion object {
        private const val TAG = "NativetalkCallSdk.Screening"
    }

    override fun onScreenCall(details: Call.Details) {
        try {
            val number = extractPhoneNumber(details)
            val isIncoming = details.callDirection == Call.Details.DIRECTION_INCOMING
            val ts = System.currentTimeMillis()
            // Optional contact lookup — only if we got a number AND the host
            // app has granted READ_CONTACTS. Silently skipped otherwise.
            val contact = if (number.isNotEmpty()) TelephonyMonitor.tryLookupContact(number) else null

            val payload = Arguments.createMap().apply {
                putString("direction", if (isIncoming) "incoming" else "outgoing")
                putString("number", number)
                putString("callerName", details.callerDisplayName ?: "")
                putDouble("timestamp", ts.toDouble())
                putInt("presentation", details.callerDisplayNamePresentation)
                if (contact != null) putMap("contact", contact)
            }
            TelephonyMonitor.emitToReact("TMPhoneCallInfo", payload)

            // We're an OBSERVER, not a blocker. All four flags false → let
            // the call proceed normally, show in the log, fire notifications.
            // Apps that want to actually block calls should use a separate
            // dialler-style screener; this SDK only surfaces metadata.
            respondToCall(
                details,
                CallResponse.Builder()
                    .setDisallowCall(false)
                    .setRejectCall(false)
                    .setSkipCallLog(false)
                    .setSkipNotification(false)
                    .build()
            )
        } catch (t: Throwable) {
            Log.e(TAG, "onScreenCall failed", t)
            // CRITICAL: must respond even on failure. Skipping respondToCall
            // hangs the system dialler — the user would see a perpetually
            // "connecting" call. Better to swallow the error and let the
            // call proceed.
            respondToCall(
                details,
                CallResponse.Builder()
                    .setDisallowCall(false)
                    .setRejectCall(false)
                    .build()
            )
        }
    }

    /**
     * Three fallback strategies for getting the phone number, in order of
     * reliability. OEM Telecom implementations are inconsistent — some
     * populate `handle`, some only `callerDisplayName`, some only `extras`.
     */
    private fun extractPhoneNumber(details: Call.Details): String {
        // 1. The standard place: `handle` is a tel: URI; we want its body.
        val handle = details.handle
        if (handle != null) {
            val number = handle.schemeSpecificPart
            if (!number.isNullOrEmpty()) return number
        }
        // 2. Some carriers shove the number into the display-name field.
        //    Only trust it if it's at least 10 digits — shorter strings are
        //    probably a real name like "John" with stray digits.
        details.callerDisplayName?.let { dn ->
            val cleaned = dn.replace(Regex("[^0-9+]"), "")
            if (cleaned.length >= 10) return cleaned
        }
        // 3. Last resort: vendor-specific extras. The three keys below cover
        //    Samsung, Xiaomi, and a few Asian carriers respectively.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            details.extras?.let { extras ->
                val extraNumber = extras.getString("android.telecom.extra.CALL_SUBJECT")
                    ?: extras.getString("call_number")
                    ?: extras.getString("phone_number")
                if (!extraNumber.isNullOrEmpty()) return extraNumber
            }
        }
        return ""
    }
}
