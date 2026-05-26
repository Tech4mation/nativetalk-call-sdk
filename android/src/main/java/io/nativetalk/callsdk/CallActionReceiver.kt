package io.nativetalk.callsdk

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Receives Answer / Decline button taps on the heads-up call notification and
 * forwards them to [CoreManager].
 */
class CallActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
        Log.d(TAG, "Received action: ${intent?.action}")
        when (intent?.action) {
            CoreManager.ACTION_ANSWER_CALL -> CoreManager.answer()
            CoreManager.ACTION_DECLINE_CALL -> CoreManager.decline()
        }
    }

    private companion object {
        const val TAG = "NativetalkCallSdk.Receiver"
    }
}
