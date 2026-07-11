import 'package:local_auth/local_auth.dart';

/// Thin wrapper around `local_auth` for Face ID / Touch ID / fingerprint login.
/// The OS performs the biometric check locally — no fingerprint/face data ever
/// reaches the app or the server. On success we simply reuse the token that was
/// stored the last time the user signed in with their password.
class BiometricService {
  static final LocalAuthentication _auth = LocalAuthentication();

  /// True when the device supports biometrics AND the user has enrolled at least
  /// one (a face or fingerprint). Guards whether we even show the button.
  static Future<bool> isAvailable() async {
    try {
      final supported = await _auth.isDeviceSupported();
      if (!supported) return false;
      final canCheck = await _auth.canCheckBiometrics;
      if (!canCheck) return false;
      final enrolled = await _auth.getAvailableBiometrics();
      return enrolled.isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  /// A human label for the button — "Face ID" on iOS Face phones, otherwise a
  /// generic "Biometrics" / "Fingerprint".
  static Future<String> label() async {
    try {
      final types = await _auth.getAvailableBiometrics();
      if (types.contains(BiometricType.face)) return 'Face ID';
      if (types.contains(BiometricType.fingerprint)) return 'Fingerprint';
    } catch (_) {}
    return 'Biometrics';
  }

  /// Prompts the OS biometric sheet. Returns true only when the user passes.
  static Future<bool> authenticate({String? reason}) async {
    try {
      return await _auth.authenticate(
        localizedReason: reason ?? 'Authenticate to sign in to Miller Storm',
        biometricOnly: true,
        persistAcrossBackgrounding: true,
      );
    } catch (_) {
      return false;
    }
  }
}
