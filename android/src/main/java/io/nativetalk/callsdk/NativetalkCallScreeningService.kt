package io.nativetalk.callsdk

import android.os.Build
import android.telecom.Call
import android.telecom.CallScreeningService
import android.util.Log
import com.facebook.react.bridge.Arguments

/**
 * Optional screening service. Apps that want to be told about every
 * inbound/outbound device call (e.g. to decide whether to suppress an
 * incoming VoIP call) must set this package as the device call-screener via
 * `TelecomManager`. Otherwise it is dormant.
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
            respondToCall(
                details,
                CallResponse.Builder()
                    .setDisallowCall(false)
                    .setRejectCall(false)
                    .build()
            )
        }
    }

    private fun extractPhoneNumber(details: Call.Details): String {
        val handle = details.handle
        if (handle != null) {
            val number = handle.schemeSpecificPart
            if (!number.isNullOrEmpty()) return number
        }
        details.callerDisplayName?.let { dn ->
            val cleaned = dn.replace(Regex("[^0-9+]"), "")
            if (cleaned.length >= 10) return cleaned
        }
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
