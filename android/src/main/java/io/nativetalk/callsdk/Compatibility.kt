package io.nativetalk.callsdk

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi

/**
 * Thin shims over `Service.startForeground(id, notification, type)` and the
 * runtime POST_NOTIFICATIONS permission check. Required because the API shape
 * changed in Android 14 (API 34).
 */
@SuppressLint("NewApi")
class Compatibility {
    companion object {
        private const val TAG = "NativetalkCallSdk.Compat"
        const val FOREGROUND_SERVICE_TYPE_PHONE_CALL = 4
        const val FOREGROUND_SERVICE_TYPE_MICROPHONE = 128

        fun startServiceForeground(
            service: Service,
            id: Int,
            notification: Notification,
            foregroundServiceType: Int
        ) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                Api34.startServiceForeground(service, id, notification, foregroundServiceType)
            } else {
                Legacy.startServiceForeground(service, id, notification)
            }
        }

        fun isPostNotificationsPermissionGranted(context: Context): Boolean {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                return context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            }
            return true
        }
    }
}

@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
private object Api34 {
    fun startServiceForeground(
        service: Service,
        id: Int,
        notification: Notification,
        foregroundServiceType: Int
    ) {
        try {
            service.startForeground(id, notification, foregroundServiceType)
        } catch (e: Exception) {
            Log.e("NativetalkCallSdk.Compat", "startForeground (API34) failed", e)
        }
    }
}

private object Legacy {
    fun startServiceForeground(service: Service, id: Int, notification: Notification) {
        try {
            service.startForeground(id, notification)
        } catch (e: Exception) {
            Log.e("NativetalkCallSdk.Compat", "startForeground (legacy) failed", e)
        }
    }
}
