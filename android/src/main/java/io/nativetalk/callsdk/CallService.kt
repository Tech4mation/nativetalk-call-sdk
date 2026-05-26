package io.nativetalk.callsdk

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.util.Log

/**
 * Foreground service that owns the call notification.
 *
 * Started by [BackgroundService] and by [NativetalkCallSdkModule.startNativeServices].
 * The actual lifecycle of the Linphone core lives in [CoreManager]; this
 * service is mostly a holder for the foreground-notification slot.
 */
class CallService : Service() {

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "onCreate")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "onStartCommand")
        CoreManager.onCallServiceStarted(this)
        return super.onStartCommand(intent, flags, startId)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onTaskRemoved(rootIntent: Intent?) {
        if (BackgroundService.shouldRestart) {
            startService(Intent(applicationContext, CallService::class.java))
        }
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.i(TAG, "onDestroy")
    }

    private companion object {
        const val TAG = "NativetalkCallSdk.CallService"
    }
}
