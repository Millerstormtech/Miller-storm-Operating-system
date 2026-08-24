import 'package:flutter/material.dart';
import 'preloader_screen.dart';

/// App-start entry: plays the branded animation preloader (dark or light to match
/// the theme), then routes to the right dashboard from the stored session — or to
/// login when there's none.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const PreloaderScreen(resolveSession: true);
  }
}
