package io.nativetalk.callsdk

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Long-running foreground service that keeps the SIP registration warm even
 * when the user has backgrounded the app. Hosts a wake lock and (re)starts
 * [CallService] if the OS kills it.
 *
 * Lifecycle: `startService()` → `onCreate` (wake lock + TelephonyMonitor) →
 * `onStartCommand` (foreground notification + spawn CallService). On
 * task-removal we schedule an alarm to relaunch ourselves a second later.
 */
class BackgroundService : Service() {

    companion object {
        private const val NOTIFICATION_ID = 1000
        private const val CHANNEL_ID = "nativetalk_background"
        private const val TAG = "NativetalkCallSdk.BgService"

        // Set to `false` by the JS bridge during explicit logout so that
        // onTaskRemoved doesn't immediately respawn us. @Volatile because
        // the flag is read/written from different threads (RN bridge thread
        // vs main thread handling task-removal).
        @Volatile var shouldRestart = true

        fun startService(context: Context) {
            val intent = Intent(context, BackgroundService::class.java)
            // `startForegroundService` (not `startService`) is required on
            // Android 8+ — the OS gives us a 5-second window to call
            // `startForeground` or it kills us with a SecurityException.
            context.startForegroundService(intent)
        }

        fun stopService(context: Context) {
            val intent = Intent(context, BackgroundService::class.java)
            context.stopService(intent)
        }
    }

    private var wakeLock: PowerManager.WakeLock? = null
    private var connectivityManager: ConnectivityManager? = null

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            Log.d(TAG, "Network available — triggering re-registration")
            CoreManager.refreshRegisters()
        }
        override fun onLost(network: Network) {
            Log.d(TAG, "Network lost")
            CoreManager.setNetworkReachable(false)
        }
    }

    override fun onCreate() {
        super.onCreate()
        createChannel()
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NativetalkCallSdk::BackgroundService")
        // 10-minute timeout: Android's StrictMode warns if a wake lock has
        // no timeout, and 10min is long enough to register & answer a call
        // but short enough that a buggy service can't drain the battery.
        wakeLock?.acquire(10 * 60 * 1000L)

        TelephonyMonitor.start(applicationContext)

        connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        connectivityManager?.registerNetworkCallback(request, networkCallback)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Must call startForeground within ~5s of startForegroundService —
        // do it first thing here.
        startForeground(NOTIFICATION_ID, buildNotification())
        // CallService owns the per-call notification; this service owns
        // the "always-on" registration notification.
        applicationContext.startService(Intent(applicationContext, CallService::class.java))
        // START_STICKY: if the OS kills us under memory pressure, restart
        // us with a null intent. That's what we want for a keep-alive.
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Fires when the user swipes the app from recents. The OS often
        // kills our service shortly after, so we set a 1-second alarm to
        // relaunch ourselves. The alarm survives even if our process dies.
        if (shouldRestart) {
            val restart = Intent(applicationContext, BackgroundService::class.java)
            val pending = PendingIntent.getService(
                this,
                1,
                restart,
                PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
            )
            val alarm = getSystemService(Context.ALARM_SERVICE) as AlarmManager
            alarm.set(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + 1000, pending)
        }
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        super.onDestroy()
        runCatching { connectivityManager?.unregisterNetworkCallback(networkCallback) }
        wakeLock?.release()
        TelephonyMonitor.stop()
    }

    private fun createChannel() {
        val ch = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.nativetalk_call_sdk_notif_channel_background_name),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = getString(R.string.nativetalk_call_sdk_ready_body)
            setShowBadge(false)
        }
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(ch)
    }

    private fun buildNotification() = NotificationCompat.Builder(this, CHANNEL_ID)
        .setContentTitle(getString(R.string.nativetalk_call_sdk_ready_title))
        .setContentText(getString(R.string.nativetalk_call_sdk_ready_body))
        .setSmallIcon(R.drawable.ic_nativetalk_call)
        .setOngoing(true)
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .build()
}
