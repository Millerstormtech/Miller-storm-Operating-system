package com.millerstorm.millerstorm_app

import android.app.UiModeManager
import android.content.Context
import android.os.Build
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

// FlutterFragmentActivity (not FlutterActivity) is required by local_auth so the
// biometric (Face ID / fingerprint) prompt can attach to the Android host.
class MainActivity : FlutterFragmentActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // The app's light/dark choice lives in Flutter (SharedPreferences), but
        // the Android 12+ system splash renders from the APP-level night mode
        // BEFORE any Dart code runs. Persist the in-app choice at the OS level
        // (UiModeManager, API 31+) so the next cold start's system splash and
        // launch background already match the in-app theme — no white flash
        // before the dark video preloader (and vice versa).
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "millerstorm/native_theme")
            .setMethodCallHandler { call, result ->
                if (call.method == "setNightMode") {
                    val dark = call.arguments as? Boolean ?: false
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        val uiModeManager = getSystemService(Context.UI_MODE_SERVICE) as UiModeManager
                        uiModeManager.setApplicationNightMode(
                            if (dark) UiModeManager.MODE_NIGHT_YES else UiModeManager.MODE_NIGHT_NO
                        )
                    }
                    result.success(null)
                } else {
                    result.notImplemented()
                }
            }
    }
}
