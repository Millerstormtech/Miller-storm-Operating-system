package com.millerstorm.millerstorm_app

import io.flutter.embedding.android.FlutterFragmentActivity

// FlutterFragmentActivity (not FlutterActivity) is required by local_auth so the
// biometric (Face ID / fingerprint) prompt can attach to the Android host.
class MainActivity : FlutterFragmentActivity()
