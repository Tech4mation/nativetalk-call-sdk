package io.nativetalk.callsdk

import androidx.annotation.AnyThread
import androidx.annotation.WorkerThread
import org.linphone.core.Address
import org.linphone.core.Call

/** Internal helpers — not exposed to JS. */
object Utils {
    @WorkerThread
    fun displayNameFor(address: Address?): String {
        if (address == null) return "[null]"
        val dn = address.displayName
        return if (dn.isNullOrEmpty()) address.username ?: address.asString() else dn
    }

    @AnyThread
    fun isCallIncoming(state: Call.State): Boolean = when (state) {
        Call.State.IncomingReceived, Call.State.IncomingEarlyMedia -> true
        else -> false
    }

    @AnyThread
    fun isCallOutgoing(state: Call.State, considerEarlyMedia: Boolean = true): Boolean = when (state) {
        Call.State.OutgoingInit, Call.State.OutgoingProgress, Call.State.OutgoingRinging -> true
        Call.State.OutgoingEarlyMedia -> considerEarlyMedia
        else -> false
    }

    @AnyThread
    fun isCallPaused(state: Call.State): Boolean = when (state) {
        Call.State.Pausing, Call.State.Paused, Call.State.PausedByRemote, Call.State.Resuming -> true
        else -> false
    }

    @AnyThread
    fun isCallEnding(state: Call.State, considerReleasedAsEnding: Boolean = false): Boolean = when (state) {
        Call.State.End, Call.State.Error -> true
        Call.State.Released -> considerReleasedAsEnding
        else -> false
    }
}
