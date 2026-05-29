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
 * Process-wide owner of the Linphone `Core`.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  Why is this an `object` (singleton)?
 * ──────────────────────────────────────────────────────────────────────────
 *
 *  Three subsystems need to talk to the SAME Linphone Core:
 *
 *    1. The React Native module ([NativetalkCallSdkModule]) when JS calls
 *       dial(), answer(), etc.
 *    2. The foreground [CallService] which owns the call notification.
 *    3. The [BackgroundService] which keeps the SIP socket warm when the
 *       app is backgrounded.
 *
 *  If any of these spawned its own Core, you'd have two SIP registrations,
 *  duplicate notifications, and audio routing fights. By centralising the
 *  Core here (process lifetime), all three subsystems share one engine.
 *
 *  This also lets an incoming push wake the engine BEFORE React mounts:
 *  the push wakes [BackgroundService] → which calls `ensureStarted()` →
 *  which registers and accepts the call. Once React boots, [attachReact]
 *  replays any in-flight call state into JS.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  React decoupling
 * ──────────────────────────────────────────────────────────────────────────
 *  Calling any method here works whether or not React is alive. Events are
 *  only forwarded to JS if [attachReact] has been called — otherwise [emit]
 *  is a silent no-op. This is what makes push-driven, RN-not-yet-ready
 *  flows possible.
 */
object CoreManager {
    private const val TAG = "NativetalkCallSdk.Core"

    // Two channels because Android shows them differently:
    //   - INCOMING uses IMPORTANCE_HIGH (heads-up notification + sound)
    //   - ONGOING uses IMPORTANCE_LOW (silent persistent notification)
    // Trying to reuse one channel for both gives you either spam (high)
    // or invisible incoming calls (low).
    const val CHANNEL_INCOMING = "incoming_calls"
    const val CHANNEL_ONGOING = "ongoing_calls"

    // Broadcast intent actions for the Answer / Decline buttons that appear
    // on the heads-up notification. Caught by [CallActionReceiver].
    const val ACTION_ANSWER_CALL = "io.nativetalk.callsdk.ACTION_ANSWER"
    const val ACTION_DECLINE_CALL = "io.nativetalk.callsdk.ACTION_DECLINE"

    // Stable notification IDs. INCOMING_CALL_ID is fixed at 1 so we can
    // always find/cancel the ringing notification; per-call notifications
    // use the call's start timestamp (see [getNotificationIdForCall]) so
    // multiple concurrent calls don't collide.
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

    /**
     * Boot (or no-op if already booted) the Linphone Core.
     *
     * Safe to call from multiple subsystems — the [Synchronized] + double
     * check makes it idempotent. The first caller wins; later callers just
     * receive a reference to the already-running core.
     *
     * After this returns, you can [register], [call], etc. — but events
     * won't reach JS until [attachReact] is also called.
     */
    @Synchronized
    fun ensureStarted(ctx: Context) {
        if (::context.isInitialized && core != null) return
        context = ctx.applicationContext
        notificationManager = NotificationManagerCompat.from(context)

        val f = Factory.instance()
        // Linphone writes diagnostic logs to disk — useful for debugging
        // production issues over the phone. They land in the app's
        // internal storage (not visible to the user).
        f.setLogCollectionPath(context.filesDir.absolutePath)
        f.enableLogCollection(LogCollectionState.Enabled)

        core = f.createCore(null, null, context)
        // KeepAlive sends OPTIONS pings to detect dead TCP/TLS sockets so
        // we can re-register before the user notices. Without it a NATted
        // session can silently die after 5+ minutes.
        core?.isKeepAliveEnabled = true
        // Tell Linphone we have a network. Without this it starts in an
        // "unreachable" state and won't even attempt registration.
        core?.isNetworkReachable = true

        // The CoreListener is how Linphone tells US about state changes.
        // Each override does two things:
        //   1. Update the foreground-service notification (Android UI).
        //   2. Forward the event to React via [emit] (cross-platform UI).
        //
        // Notifications go FIRST so that even if React is dead (e.g. the
        // app was killed and we're being woken by push), the user still
        // sees a ringing notification.
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
                // Always emit the raw state — JS does its own FSM bucketing.
                emit("CallState", Arguments.createMap().apply {
                    putString("state", state.toString())
                    putString("message", message)
                })

                when (state) {
                    // ── Inbound: phone is ringing ─────────────────────────
                    Call.State.IncomingReceived, Call.State.IncomingEarlyMedia -> {
                        val addr = call.remoteAddress
                        val disp = addr?.displayName ?: ""
                        val user = addr?.username ?: ""
                        val uri = addr?.asStringUriOnly() ?: addr?.asString() ?: ""

                        // Show the heads-up notification BEFORE telling JS.
                        // If the app is in the background the notification
                        // is the only UI the user can see — without it the
                        // call would silently miss-fire.
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

                    // ── Outbound: we just placed a call ───────────────────
                    Call.State.OutgoingInit -> showCallNotification(call, false)

                    // ── SIP "200 OK" received — call accepted by remote ──
                    Call.State.Connected -> {
                        if (call.dir == Call.Dir.Incoming) {
                            // Incoming call was answered — tear down the
                            // ringing foreground notification because the
                            // in-call UI is now responsible for foreground.
                            stopCallForegroundService()
                        } else {
                            // Outgoing call connected — upgrade the
                            // notification from "calling…" to "in call".
                            showCallNotification(call, false)
                        }
                    }

                    // ── Audio actually flowing both ways ──────────────────
                    Call.State.StreamsRunning -> {
                        // Re-publish the notification with FOREGROUND_SERVICE_TYPE_MICROPHONE
                        // so Android 14+ allows continued mic access. See
                        // [startInCallForegroundService] for the type mask logic.
                        val notifiable = getNotifiableForCall(call)
                        if (notifiable.notificationId == currentInCallServiceNotificationId) {
                            startInCallForegroundService(call)
                        }
                    }

                    // ── Terminal: hangup, error, or fully released ───────
                    Call.State.End, Call.State.Released, Call.State.Error -> {
                        stopCallForegroundService()
                        emit("CallEnded", Arguments.createMap())
                    }

                    // Pause, Resume, EarlyMedia, etc. — JS handles the UI;
                    // no native-side notification change needed.
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

    /**
     * Builds the system call notification.
     *
     * Uses [NotificationCompat.CallStyle] (Android 12+) which gives us the
     * standard pill-shaped Answer / Decline buttons that users recognise
     * from the native dialer. On older Android versions the system falls
     * back to a regular notification with action buttons.
     *
     * Two important details:
     *
     *  - [setFullScreenIntent] makes the notification take over the screen
     *    when the device is locked (the "ringing on lockscreen" UX). This
     *    requires the `USE_FULL_SCREEN_INTENT` permission, which the SDK
     *    declares in its manifest.
     *  - `setAutoCancel(false) + setOngoing(true)` together prevent the
     *    user from swiping the notification away while the call is live.
     */
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

        // Incoming style gives BOTH answer and decline actions; ongoing
        // (active call) gives only end-call.
        val style = if (isIncoming) {
            NotificationCompat.CallStyle.forIncomingCall(caller, decline, answer)
        } else {
            NotificationCompat.CallStyle.forOngoingCall(caller, decline)
        }

        val channelId = if (isIncoming) CHANNEL_INCOMING else CHANNEL_ONGOING
        return NotificationCompat.Builder(context, channelId).apply {
            setColorized(true)        // colour the whole notification, not just the icon
            setOnlyAlertOnce(true)    // don't re-sound on update
            setStyle(style)
            setSmallIcon(R.drawable.ic_nativetalk_call)
            setCategory(NotificationCompat.CATEGORY_CALL)
            setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            // PRIORITY_MAX on incoming = the heads-up actually appears.
            // PRIORITY_HIGH on ongoing = persistent but not screaming.
            setPriority(
                if (isIncoming) NotificationCompat.PRIORITY_MAX
                else NotificationCompat.PRIORITY_HIGH
            )
            // Linphone gives startDate in seconds; Android wants ms.
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

    // ══════════════════════════════════════════════════════════════════════
    //  Registration & calling
    // ══════════════════════════════════════════════════════════════════════

    /**
     * Wipe every proxy config and auth info from the core.
     *
     * Linphone is happy to accumulate accounts — call [Core.addAuthInfo]
     * twice with different passwords and BOTH stick around, with no clear
     * "winner". When we switch users (or want to recover from a bad
     * password), we have to scrub the slate first or we'll fail with stale
     * credentials.
     *
     * Each removal is wrapped in [runCatching] because Linphone occasionally
     * throws when you remove a config it's mid-way through using. Best-effort
     * is fine here — the goal is "core is in a clean state when this
     * returns", not "every individual removal succeeded".
     */
    private fun wipeAllAccounts(c: Core) {
        try {
            val proxies = c.proxyConfigList?.toList() ?: emptyList()
            proxies.forEach { pc ->
                runCatching { pc.isRegisterEnabled = false }
                runCatching { c.removeProxyConfig(pc) }
            }
            runCatching { c.defaultProxyConfig = null }
            try { c.clearAllAuthInfo() } catch (_: Throwable) {
                // Fallback for Linphone builds without clearAllAuthInfo().
                c.authInfoList?.toList()?.forEach { ai -> runCatching { c.removeAuthInfo(ai) } }
            }
            runCatching { c.refreshRegisters() }
        } catch (_: Throwable) { /* best effort */ }
    }

    /**
     * Register the given SIP account, replacing any previous one.
     *
     * Has a fast path for the "same user re-registering" case: if we
     * already have a healthy session with this exact username+domain, we
     * just update the auth (in case the password changed) and refresh.
     * Skipping the wipe matters because [wipeAllAccounts] briefly puts the
     * core into an unregistered state — if you're calling this from a
     * "periodic re-register" loop, you don't want a 200ms outage every time.
     *
     * Falls through to a full wipe + setup if the identity changed.
     */
    fun register(username: String, password: String, domain: String, transport: String?) {
        val c = core ?: return

        // ── Fast path: same user, already healthy ─────────────────────────
        val current = c.defaultProxyConfig
        val currentIdentity = current?.identityAddress
        val healthy = current?.state == org.linphone.core.RegistrationState.Ok
        if (current != null && currentIdentity != null && healthy &&
            currentIdentity.username == username && currentIdentity.domain == domain
        ) {
            // Password may have changed; the auth info is keyed by username
            // so adding a fresh one replaces the old.
            val auth = Factory.instance().createAuthInfo(username, null, password, null, null, domain)
            c.addAuthInfo(auth)
            c.refreshRegisters()
            return
        }

        // ── Slow path: new user, or previous session was unhealthy ────────
        try {
            wipeAllAccounts(c)
            val auth = Factory.instance().createAuthInfo(username, null, password, null, null, domain)
            c.addAuthInfo(auth)

            // Identity = "the SIP address other parties dial to reach us"
            val id = Factory.instance().createAddress("sip:$username@$domain") ?: return

            // Server URI tells Linphone where to send REGISTER. The
            // ";transport=tcp" parameter is required if your PBX only
            // listens on TCP (most do for security reasons).
            var server = "sip:$domain"
            if (!transport.isNullOrEmpty()) server += ";transport=${transport.lowercase()}"

            val proxy = c.createProxyConfig().apply {
                identityAddress = id
                serverAddr = server
                isRegisterEnabled = true
                // Re-register every 10 minutes. PBX server controls the
                // actual TTL via the 200 OK response — this is just our
                // requested ceiling.
                expires = 600
            }
            c.addProxyConfig(proxy)
            c.defaultProxyConfig = proxy
            c.refreshRegisters()
        } catch (e: Exception) {
            Log.e(TAG, "Registration failed", e)
        }
    }

    /**
     * Re-ping the SIP server to confirm we're still registered.
     *
     * If the registration is in the Failed state, toggling
     * [isRegisterEnabled] kicks Linphone into trying again — sometimes
     * `refreshRegisters()` alone won't recover from a 401 or socket reset.
     */
    fun refreshRegisters() {
        val c = core ?: return
        // Tell Linphone the network is back, in case it gave up.
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
