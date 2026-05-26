package io.nativetalk.callsdk

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.PendingIntent
import android.app.Service.STOP_FOREGROUND_REMOVE
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.annotation.AnyThread
import androidx.annotation.MainThread
import androidx.annotation.WorkerThread
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.linphone.core.AudioDevice
import org.linphone.core.Call
import org.linphone.core.Core
import org.linphone.core.CoreListener
import org.linphone.core.CoreListenerStub
import org.linphone.core.Factory
import org.linphone.core.LogCollectionState
import org.linphone.core.Reason
import java.text.SimpleDateFormat
import java.util.Date
import java.util.HashMap
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs

/**
 * Process-wide owner of the Linphone `Core`. Both React and the background
 * services talk to this object — keeping the core in a single static instance
 * means an incoming push can wake the engine before React mounts.
 *
 * No React API is required to call any of these methods; events are only
 * forwarded to JS if [attachReact] has been called.
 */
object CoreManager {
    private const val TAG = "NativetalkCallSdk.Core"

    const val CHANNEL_INCOMING = "incoming_calls"
    const val CHANNEL_ONGOING = "ongoing_calls"

    const val ACTION_ANSWER_CALL = "io.nativetalk.callsdk.ACTION_ANSWER"
    const val ACTION_DECLINE_CALL = "io.nativetalk.callsdk.ACTION_DECLINE"

    private const val INCOMING_CALL_ID = 1
    private const val INTENT_ANSWER_CALL_NOTIF_CODE = 2
    private const val INTENT_DECLINE_CALL_NOTIF_CODE = 3

    private var core: Core? = null
    private var listener: CoreListener? = null

    private val callNotificationsMap: HashMap<String, Notifiable> = HashMap()
    private val notificationsMap = HashMap<Int, Notification>()

    private var callService: CallService? = null
    private var currentInCallServiceNotificationId = -1
    private var inCallServiceForegroundNotificationPublished = false
    private var waitForInCallServiceForegroundToStopIt = false

    @Volatile
    private var reactContext: ReactApplicationContext? = null

    private lateinit var notificationManager: NotificationManagerCompat
    private lateinit var context: Context

    @JvmStatic
    fun core(): Core? = core

    @Synchronized
    fun ensureStarted(ctx: Context) {
        if (::context.isInitialized && core != null) return
        context = ctx.applicationContext
        notificationManager = NotificationManagerCompat.from(context)

        val f = Factory.instance()
        f.setLogCollectionPath(context.filesDir.absolutePath)
        f.enableLogCollection(LogCollectionState.Enabled)

        core = f.createCore(null, null, context)
        core?.isKeepAliveEnabled = true
        core?.isNetworkReachable = true

        listener = object : CoreListenerStub() {
            override fun onRegistrationStateChanged(
                c: Core,
                proxy: org.linphone.core.ProxyConfig,
                state: org.linphone.core.RegistrationState,
                message: String
            ) {
                emit("RegistrationChanged", Arguments.createMap().apply {
                    putString("state", state.toString())
                    putString("message", message)
                })
                Log.d(TAG, "Registration -> $state ($message)")
            }

            override fun onCallStateChanged(c: Core, call: Call, state: Call.State, message: String) {
                emit("CallState", Arguments.createMap().apply {
                    putString("state", state.toString())
                    putString("message", message)
                })

                when (state) {
                    Call.State.IncomingReceived, Call.State.IncomingEarlyMedia -> {
                        val addr = call.remoteAddress
                        val disp = addr?.displayName ?: ""
                        val user = addr?.username ?: ""
                        val uri = addr?.asStringUriOnly() ?: addr?.asString() ?: ""

                        showCallNotification(call, true)

                        emit("CallIncoming", Arguments.createMap().apply {
                            putString(
                                "from",
                                if (disp.isNotEmpty() && disp.lowercase() != "anonymous") disp else user
                            )
                            putString("displayName", disp)
                            putString("username", user)
                            putString("uri", uri)
                            putString("callId", call.callLog?.callId ?: "")
                        })
                    }

                    Call.State.OutgoingInit -> showCallNotification(call, false)

                    Call.State.Connected -> {
                        if (call.dir == Call.Dir.Incoming) {
                            stopCallForegroundService()
                        } else {
                            showCallNotification(call, false)
                        }
                    }

                    Call.State.StreamsRunning -> {
                        val notifiable = getNotifiableForCall(call)
                        if (notifiable.notificationId == currentInCallServiceNotificationId) {
                            startInCallForegroundService(call)
                        }
                    }

                    Call.State.End, Call.State.Released, Call.State.Error -> {
                        stopCallForegroundService()
                        emit("CallEnded", Arguments.createMap())
                    }

                    else -> Unit
                }
            }
        }
        core?.addListener(listener)
        core?.start()

        TelephonyMonitor.start(context)
    }

    @MainThread
    fun onCallServiceStarted(service: CallService) {
        ensureStarted(service)
        callService = service
        createCallNotificationChannels()
    }

    fun attachReact(react: ReactApplicationContext) {
        // If a call was already ringing when JS finishes booting, replay it.
        val call = core?.currentCall
        if (call != null && call.dir == Call.Dir.Incoming) {
            val addr = call.remoteAddress
            val disp = addr?.displayName ?: ""
            val user = addr?.username ?: ""
            val uri = addr?.asStringUriOnly() ?: addr?.asString() ?: ""

            emit("CallIncoming", Arguments.createMap().apply {
                putString("from", if (disp.isNotEmpty() && disp.lowercase() != "anonymous") disp else user)
                putString("displayName", disp)
                putString("username", user)
                putString("uri", uri)
            })
        }
        reactContext = react
    }

    fun detachReact() {
        reactContext = null
    }

    // === Notifications ===

    class Notifiable(val notificationId: Int) {
        var remoteAddress: String? = null
    }

    private fun createCallNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val incoming = NotificationChannel(
            CHANNEL_INCOMING,
            "Incoming Calls",
            NotificationManagerCompat.IMPORTANCE_HIGH
        ).apply {
            description = "Incoming SIP/VoIP calls"
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        notificationManager.createNotificationChannel(incoming)

        val ongoing = NotificationChannel(
            CHANNEL_ONGOING,
            "Ongoing Calls",
            NotificationManagerCompat.IMPORTANCE_LOW
        ).apply {
            description = "Active SIP/VoIP calls"
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        notificationManager.createNotificationChannel(ongoing)
    }

    @WorkerThread
    private fun getNotificationIdForCall(call: Call): Int = call.callLog.startDate.toInt()

    @WorkerThread
    private fun getNotifiableForCall(call: Call): Notifiable {
        val address = call.remoteAddress.asStringUriOnly()
        var n = callNotificationsMap[address]
        if (n == null) {
            n = Notifiable(getNotificationIdForCall(call))
            n.remoteAddress = address
            callNotificationsMap[address] = n
        }
        return n
    }

    @AnyThread
    private fun callDeclinePendingIntent(notifiable: Notifiable): PendingIntent {
        val i = Intent(context, CallActionReceiver::class.java).apply {
            action = ACTION_DECLINE_CALL
            putExtra("NOTIFICATION_ID", notifiable.notificationId)
            putExtra("REMOTE_ADDRESS", notifiable.remoteAddress)
        }
        return PendingIntent.getBroadcast(
            context,
            INTENT_DECLINE_CALL_NOTIF_CODE,
            i,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    @AnyThread
    private fun callAnswerPendingIntent(notifiable: Notifiable): PendingIntent {
        val i = Intent(context, CallActionReceiver::class.java).apply {
            action = ACTION_ANSWER_CALL
            putExtra("NOTIFICATION_ID", notifiable.notificationId)
            putExtra("REMOTE_ADDRESS", notifiable.remoteAddress)
        }
        return PendingIntent.getBroadcast(
            context,
            INTENT_ANSWER_CALL_NOTIF_CODE,
            i,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    @WorkerThread
    private fun createCallNotification(
        call: Call,
        notifiable: Notifiable,
        contentIntent: PendingIntent?,
        isIncoming: Boolean
    ): Notification {
        val decline = callDeclinePendingIntent(notifiable)
        val answer = callAnswerPendingIntent(notifiable)
        val remote = call.callLog.remoteAddress

        val caller = Person.Builder()
            .setName(Utils.displayNameFor(remote).ifEmpty { "Unknown" })
            .setImportant(false)
            .build()

        val style = if (isIncoming) {
            NotificationCompat.CallStyle.forIncomingCall(caller, decline, answer)
        } else {
            NotificationCompat.CallStyle.forOngoingCall(caller, decline)
        }

        val channelId = if (isIncoming) CHANNEL_INCOMING else CHANNEL_ONGOING
        return NotificationCompat.Builder(context, channelId).apply {
            setColorized(true)
            setOnlyAlertOnce(true)
            setStyle(style)
            setSmallIcon(R.drawable.ic_nativetalk_call)
            setCategory(NotificationCompat.CATEGORY_CALL)
            setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            setPriority(
                if (isIncoming) NotificationCompat.PRIORITY_MAX
                else NotificationCompat.PRIORITY_HIGH
            )
            setWhen(call.callLog.startDate * 1000)
            setAutoCancel(false)
            setOngoing(true)
            setContentIntent(contentIntent)
            setFullScreenIntent(contentIntent, true)
        }.build()
    }

    private fun showCallNotification(call: Call, isIncoming: Boolean) {
        val notifiable = getNotifiableForCall(call)
        val display = Utils.displayNameFor(call.callLog.remoteAddress).ifEmpty { "Unknown" }
        val initials = display.take(2).uppercase()
        val phone = call.remoteAddress.asStringUriOnly()

        // Try to open the host app's launcher activity when the notification is
        // tapped. Apps that need to route to a specific screen can listen for
        // the JS `CallIncoming` / `CallEnded` events and navigate themselves.
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        val openIntent = launchIntent ?: Intent()
        openIntent.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra("NativetalkCallSdk_call_id", call.callLog?.callId ?: "")
            putExtra("NativetalkCallSdk_phone", phone)
            putExtra("NativetalkCallSdk_displayName", display)
            putExtra("NativetalkCallSdk_initials", initials)
            putExtra(if (isIncoming) "IncomingCall" else "ActiveCall", true)
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = createCallNotification(call, notifiable, pendingIntent, isIncoming)
        if (isIncoming) {
            showIncomingCallForegroundServiceNotification(notification)
        } else {
            showInCallForegroundServiceNotification(call, notifiable, notification)
        }
    }

    private fun showIncomingCallForegroundServiceNotification(notification: Notification) {
        val service = callService ?: return
        if (!Compatibility.isPostNotificationsPermissionGranted(context)) {
            Log.e(TAG, "POST_NOTIFICATIONS not granted — can't start incoming foreground service")
            return
        }
        createCallNotificationChannels()
        Compatibility.startServiceForeground(
            service,
            INCOMING_CALL_ID,
            notification,
            Compatibility.FOREGROUND_SERVICE_TYPE_PHONE_CALL
        )
    }

    private fun showInCallForegroundServiceNotification(
        call: Call,
        notifiable: Notifiable,
        notification: Notification
    ) {
        val service = callService ?: return
        var mask = Compatibility.FOREGROUND_SERVICE_TYPE_PHONE_CALL
        val state = call.state
        if (!Utils.isCallIncoming(state) && !Utils.isCallOutgoing(state) && !Utils.isCallEnding(state)) {
            if (ActivityCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED
            ) {
                mask = mask or Compatibility.FOREGROUND_SERVICE_TYPE_MICROPHONE
            }
        }
        if (Compatibility.isPostNotificationsPermissionGranted(context)) {
            Compatibility.startServiceForeground(service, notifiable.notificationId, notification, mask)
            notificationsMap[notifiable.notificationId] = notification
            currentInCallServiceNotificationId = notifiable.notificationId
            inCallServiceForegroundNotificationPublished = true
            if (waitForInCallServiceForegroundToStopIt) stopCallForegroundService()
        }
    }

    @WorkerThread
    private fun startInCallForegroundService(call: Call) {
        val service = callService ?: return
        val notifiable = getNotifiableForCall(call)
        val notification = notificationsMap[notifiable.notificationId]
            ?: notificationsMap[INCOMING_CALL_ID]
            ?: return
        showInCallForegroundServiceNotification(call, notifiable, notification)
    }

    private fun stopCallForegroundService() {
        val service = callService ?: return
        service.stopForeground(STOP_FOREGROUND_REMOVE)
        inCallServiceForegroundNotificationPublished = false
        waitForInCallServiceForegroundToStopIt = false
    }

    // === Registration & calling ===

    private fun wipeAllAccounts(c: Core) {
        try {
            val proxies = c.proxyConfigList?.toList() ?: emptyList()
            proxies.forEach { pc ->
                runCatching { pc.isRegisterEnabled = false }
                runCatching { c.removeProxyConfig(pc) }
            }
            runCatching { c.defaultProxyConfig = null }
            try { c.clearAllAuthInfo() } catch (_: Throwable) {
                c.authInfoList?.toList()?.forEach { ai -> runCatching { c.removeAuthInfo(ai) } }
            }
            runCatching { c.refreshRegisters() }
        } catch (_: Throwable) { /* best effort */ }
    }

    fun register(username: String, password: String, domain: String, transport: String?) {
        val c = core ?: return

        // Skip the wipe if the same user is already registered & healthy.
        val current = c.defaultProxyConfig
        val currentIdentity = current?.identityAddress
        val healthy = current?.state == org.linphone.core.RegistrationState.Ok
        if (current != null && currentIdentity != null && healthy &&
            currentIdentity.username == username && currentIdentity.domain == domain
        ) {
            val auth = Factory.instance().createAuthInfo(username, null, password, null, null, domain)
            c.addAuthInfo(auth)
            c.refreshRegisters()
            return
        }

        try {
            wipeAllAccounts(c)
            val auth = Factory.instance().createAuthInfo(username, null, password, null, null, domain)
            c.addAuthInfo(auth)

            val id = Factory.instance().createAddress("sip:$username@$domain") ?: return
            var server = "sip:$domain"
            if (!transport.isNullOrEmpty()) server += ";transport=${transport.lowercase()}"

            val proxy = c.createProxyConfig().apply {
                identityAddress = id
                serverAddr = server
                isRegisterEnabled = true
                expires = 600
            }
            c.addProxyConfig(proxy)
            c.defaultProxyConfig = proxy
            c.refreshRegisters()
        } catch (e: Exception) {
            Log.e(TAG, "Registration failed", e)
        }
    }

    fun refreshRegisters() {
        val c = core ?: return
        c.isNetworkReachable = true
        c.refreshRegisters()
        c.defaultProxyConfig?.let { proxy ->
            if (proxy.state == org.linphone.core.RegistrationState.Failed) {
                proxy.isRegisterEnabled = false
                proxy.isRegisterEnabled = true
            }
        }
    }

    fun call(sipUri: String) {
        val c = core ?: return
        try {
            val addr = Factory.instance().createAddress(sipUri) ?: return
            val params = c.createCallParams(null) ?: return
            c.inviteAddressWithParams(addr, params)
        } catch (_: Exception) {}
    }

    fun answer() { try { core?.currentCall?.accept() } catch (_: Exception) {} }

    fun decline(reason: Reason = Reason.Declined) {
        val call = core?.currentCall ?: return
        try {
            when (call.state) {
                Call.State.IncomingReceived, Call.State.IncomingEarlyMedia -> call.decline(reason)
                else -> call.terminate()
            }
        } catch (_: Exception) {}
    }

    fun end() {
        val call = core?.currentCall ?: return
        try {
            when (call.state) {
                Call.State.IncomingReceived, Call.State.IncomingEarlyMedia -> call.decline(Reason.Declined)
                else -> call.terminate()
            }
        } catch (_: Exception) {}
    }

    fun mute(on: Boolean) { core?.isMicEnabled = !on }

    fun speaker(on: Boolean) {
        val c = core ?: return
        val dev = c.audioDevices?.let { devices ->
            if (on) devices.firstOrNull { it.type == AudioDevice.Type.Speaker }
            else devices.firstOrNull { it.type == AudioDevice.Type.Earpiece }
        }
        if (dev != null) c.outputAudioDevice = dev
    }

    fun sendDtmf(d: String) {
        try {
            val b = d.encodeToByteArray().firstOrNull() ?: return
            core?.currentCall?.sendDtmf(b.toInt().toChar())
        } catch (_: Exception) {}
    }

    fun hold() { try { core?.currentCall?.pause() } catch (_: Exception) {} }
    fun resume() { try { core?.currentCall?.resume() } catch (_: Exception) {} }

    fun setRegisterEnabled(on: Boolean) {
        val c = core ?: return
        val proxy = c.defaultProxyConfig ?: return
        try {
            proxy.isRegisterEnabled = on
            c.refreshRegisters()
        } catch (_: Exception) {}
    }

    // === Call logs ===

    private fun sipUserPart(uri: String): String {
        val match = Regex("sip:([^@]+)@").find(uri)
        return match?.groupValues?.get(1) ?: uri.removePrefix("sip:")
    }

    private fun guessCallType(direction: String, called: String, mySipUser: String?): String {
        return when {
            direction == "inbound" && called == mySipUser -> "LOCAL"
            direction == "outbound" && called.startsWith("0") -> "DID"
            else -> "STANDARD"
        }
    }

    private fun dispositionFor(status: String): Map<String, Any> = when {
        status.contains("Success", ignoreCase = true) -> mapOf("text" to "ANSWERED", "code" to 0)
        status.contains("Missed", ignoreCase = true) -> mapOf("text" to "NO ANSWER", "code" to 3)
        status.contains("Declined", ignoreCase = true) ||
            status.contains("Busy", ignoreCase = true) -> mapOf("text" to "BUSY", "code" to 5)
        status.contains("Aborted", ignoreCase = true) ||
            status.contains("EarlyAborted", ignoreCase = true) -> mapOf("text" to "CANCEL", "code" to 4)
        else -> mapOf("text" to "FAILED", "code" to 8)
    }

    private fun formatDuration(seconds: Int): String {
        val mins = seconds / 60
        val secs = seconds % 60
        return String.format(Locale.US, "%02d:%02d", mins, secs)
    }

    fun getCallLogs(): WritableArray {
        val c = core
        val logs = c?.callLogs
        if (logs.isNullOrEmpty()) return WritableNativeArray()

        val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }

        var mySipUser: String? = null
        c.defaultProxyConfig?.identityAddress?.username?.let { if (it.isNotEmpty()) mySipUser = it }

        val items = WritableNativeArray()
        logs.forEachIndexed { idx, log ->
            val fromRaw = log.fromAddress?.asStringUriOnly() ?: log.fromAddress?.asString() ?: ""
            val toRaw = log.toAddress?.asStringUriOnly() ?: log.toAddress?.asString() ?: ""
            val fromNum = sipUserPart(fromRaw)
            val toNum = sipUserPart(toRaw)

            val direction = when {
                log.dir.toString().contains("Incoming", ignoreCase = true) -> "inbound"
                log.dir.toString().contains("Outgoing", ignoreCase = true) -> "outbound"
                else -> log.dir.toString().lowercase()
            }

            val startISO = try {
                iso.format(Date(log.startDate * 1000L))
            } catch (_: Exception) { iso.format(Date()) }

            val callType = guessCallType(direction, toNum, mySipUser)
            val disposition = dispositionFor(log.status.toString())
            val durationStr = formatDuration(log.duration)
            val destination = if (callType == "LOCAL") "Local" else ""
            val idVal = log.callId?.let { abs(it.hashCode()) } ?: (100000 + idx)

            items.pushMap(WritableNativeMap().apply {
                putInt("id", idVal)
                putString("call_start", startISO)
                putString("call_type", callType)
                putString("caller_id", "$fromNum <$fromNum>")
                putString("call_direction", direction)
                putString("called_number", toNum)
                putMap("disposition", WritableNativeMap().apply {
                    putString("text", disposition["text"] as String)
                    putInt("code", disposition["code"] as Int)
                })
                putString("debit", "0.0000")
                putString("duration", durationStr)
                putString("destination", destination)
                putString("sip_user", mySipUser ?: "")
                putString("created_at", startISO)
                putString("updated_at", startISO)
            })
        }
        return items
    }

    @Synchronized
    fun stop() {
        try {
            listener?.let { core?.removeListener(it) }
            core?.stop()
        } catch (_: Exception) {}
        core = null
    }

    private fun emit(event: String, body: com.facebook.react.bridge.WritableMap) {
        val rc = reactContext
        if (rc != null && rc.hasActiveCatalystInstance()) {
            rc.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(event, body)
        }
    }
}
