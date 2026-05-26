package io.nativetalk.callsdk

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * React Native package entry. Registered automatically by autolinking — no
 * manual changes to `MainApplication` needed in apps using React Native 0.71+.
 */
class NativetalkCallSdkPackage : ReactPackage {
    override fun createNativeModules(rc: ReactApplicationContext): List<NativeModule> =
        listOf(NativetalkCallSdkModule(rc))

    override fun createViewManagers(rc: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
