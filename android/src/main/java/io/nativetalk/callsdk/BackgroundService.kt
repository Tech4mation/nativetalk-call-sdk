package io.nativetalk.callsdk

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Long-running foreground service that keeps the SIP registration warm even
 * when the user has backgrounded the app. Hosts a wake lock and (re)starts
 * [CallService] if the OS kills it.
 */
class BackgroundService : Service() {

    companion object {
        private const val NOTIFICATION_ID = 1000
        private const val CHANNEL_ID = "nativetalk_background"
        private const val TAG = "NativetalkCallSdk.BgService"

        @Volatile var shouldRestart = true

        fun startService(context: Context) {
            val intent = Intent(context, BackgroundService::class.java)
            context.startForegroundService(intent)
        }

        fun stopService(context: Context) {
            val intent = Intent(context, BackgroundService::class.java)
            context.stopService(intent)
        }
    }

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NativetalkCallSdk::BackgroundService")
        wakeLock?.acquire(10 * 60 * 1000L)

        TelephonyMonitor.start(applicationContext)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification())
        applicationContext.startService(Intent(applicationContext, CallService::class.java))
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onTaskRemoved(rootIntent: Intent?) {
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
