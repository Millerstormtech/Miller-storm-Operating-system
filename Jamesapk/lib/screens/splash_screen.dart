import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'package:millerstorm_app/services/firebase_messaging_service.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _checkSession();
  }

  Future<void> _checkSession() async {
    await Future.delayed(const Duration(seconds: 2));
    
    try {
      final prefs = await SharedPreferences.getInstance();
      final userStr = prefs.getString('user');
      
      if (!mounted) return;
      
      if (userStr != null) {
        final user = jsonDecode(userStr);
        final role = user['role'] as String?;

        // Refresh FCM token on every app open so all users stay up to date
        FirebaseMessagingService.saveTokenAfterLogin();

        if (role == 'sales') {
          Navigator.pushReplacementNamed(context, '/courses');
        } else if (role == 'manager') {
          Navigator.pushReplacementNamed(context, '/manager-training');
        } else {
          Navigator.pushReplacementNamed(context, '/login');
        }
      } else {
        Navigator.pushReplacementNamed(context, '/login');
      }
    } catch (e) {
      if (!mounted) return;
      Navigator.pushReplacementNamed(context, '/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Image.asset(
              'assets/images/logo.jpeg',
              width: 200,
              height: 120,
              fit: BoxFit.contain,
            ),
            const SizedBox(height: 32),
            const CircularProgressIndicator(
              color: Color(0xFFCB0002),
              strokeWidth: 3,
            ),
          ],
        ),
      ),
    );
  }
}
