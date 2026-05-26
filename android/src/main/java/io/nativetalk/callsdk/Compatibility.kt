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
 * Thin shims over `Service.startForeground(…)` and the runtime
 * POST_NOTIFICATIONS check. Required because Android 14 (API 34) made the
 * foreground-service-type parameter MANDATORY for `phoneCall` / `microphone`
 * services — calling the 2-arg overload on API 34 throws SecurityException,
 * while the 3-arg overload doesn't exist on older versions.
 *
 * Centralising the version dispatch here keeps [CoreManager] free of
 * `Build.VERSION.SDK_INT` checks.
 */
@SuppressLint("NewApi")
class Compatibility {
    companion object {
        private const val TAG = "NativetalkCallSdk.Compat"

        // Type bitmask values, copied here so callers don't need to depend
        // on android.content.pm.ServiceInfo (which would force API-30+).
        //   4   = ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
        //   128 = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        // OR them together when a call needs both mic + phoneCall (active call).
        const val FOREGROUND_SERVICE_TYPE_PHONE_CALL = 4
        const val FOREGROUND_SERVICE_TYPE_MICROPHONE = 128

        // Dispatch to the right startForeground overload by API level.
        // `UPSIDE_DOWN_CAKE` is the Build.VERSION_CODES constant for API 34.
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

        // POST_NOTIFICATIONS only exists as a runtime permission on Android
        // 13+ (TIRAMISU). On older versions, having the manifest entry is
        // enough — return true so callers don't need their own version check.
        fun isPostNotificationsPermissionGranted(context: Context): Boolean {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                return context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            }
            return true
        }
    }
}

// API 34+ path. The `@RequiresApi` annotation lets the IDE catch any caller
// that bypasses [Compatibility.startServiceForeground] and reaches this
// directly on an older device.
@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
private object Api34 {
    fun startServiceForeground(
        service: Service,
        id: Int,
        notification: Notification,
        foregroundServiceType: Int
    ) {
        // Wrapped in try/catch because even with the right type mask the
        // OS can still reject the foreground transition (e.g. user disabled
        // POST_NOTIFICATIONS, or background-start restrictions). We log
        // rather than crash because the call itself usually still works —
        // just without a notification.
        try {
            service.startForeground(id, notification, foregroundServiceType)
        } catch (e: Exception) {
            Log.e("NativetalkCallSdk.Compat", "startForeground (API34) failed", e)
        }
    }
}

// Pre-API-34 path: the 2-arg overload. No type mask needed.
private object Legacy {
    fun startServiceForeground(service: Service, id: Int, notification: Notification) {
        try {
            service.startForeground(id, notification)
        } catch (e: Exception) {
            Log.e("NativetalkCallSdk.Compat", "startForeground (legacy) failed", e)
        }
    }
}
