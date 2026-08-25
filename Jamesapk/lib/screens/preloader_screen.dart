import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:video_player/video_player.dart';
import 'package:millerstorm_app/services/firebase_messaging_service.dart';
import '../theme/app_theme.dart';

/// Full-screen branded preloader that plays the Miller Storm animation (dark or
/// light, matching the selected theme) once, then routes onward. Shown at app
/// start (session mode) and right after a successful login, before the dashboard.
///
///  - session mode  (`resolveSession: true`): resolves the destination from the
///    stored user's role, or `/login` when there's no session.
///  - handoff mode  (`nextRoute: '/rankings'`): navigates to that route.
///
/// A safety timeout still routes onward if the video stalls or fails to load, so
/// the user is never stuck on the animation.
class PreloaderScreen extends StatefulWidget {
  final String? nextRoute;
  final bool resolveSession;
  const PreloaderScreen({super.key, this.nextRoute, this.resolveSession = false});

  @override
  State<PreloaderScreen> createState() => _PreloaderScreenState();
}

class _PreloaderScreenState extends State<PreloaderScreen> {
  VideoPlayerController? _controller;
  bool _navigated = false;
  Timer? _fallbackTimer;

  @override
  void initState() {
    super.initState();
    _initVideo();
    // Hard safety net: never let the preloader trap the user, even if the asset
    // is missing or the platform never reports completion.
    _fallbackTimer = Timer(const Duration(seconds: 6), _goNext);
  }

  Future<void> _initVideo() async {
    final asset = themeController.isDark
        ? 'assets/videos/millerstorm_dark.mp4'
        : 'assets/videos/millerstorm_light.mp4';
    final controller = VideoPlayerController.asset(asset);
    _controller = controller;
    try {
      await controller.initialize();
      if (!mounted) return;
      controller.setVolume(0);
      controller.addListener(_onTick);
      await controller.play();
      setState(() {});
    } catch (_) {
      // Asset/codec problem — skip straight through after a brief beat.
      if (mounted) Timer(const Duration(milliseconds: 400), _goNext);
    }
  }

  // Navigate the moment the clip finishes playing.
  void _onTick() {
    final c = _controller;
    if (c == null || !c.value.isInitialized) return;
    final pos = c.value.position;
    final dur = c.value.duration;
    if (dur > Duration.zero && pos >= dur && !c.value.isPlaying) {
      _goNext();
    }
  }

  Future<void> _goNext() async {
    if (_navigated || !mounted) return;
    _navigated = true;
    _fallbackTimer?.cancel();

    if (widget.nextRoute != null) {
      Navigator.pushReplacementNamed(context, widget.nextRoute!);
      return;
    }

    // Session mode: resolve the destination from the stored user's role.
    String route = '/login';
    try {
      final prefs = await SharedPreferences.getInstance();
      final userStr = prefs.getString('user');
      if (userStr != null) {
        final role = (jsonDecode(userStr)['role'] ?? '').toString();
        FirebaseMessagingService.saveTokenAfterLogin();
        switch (role) {
          case 'sales':
            route = '/rankings';
            break;
          case 'marketing':
            route = '/marketing-rankings';
            break;
          case 'sales-team-lead':
            route = '/manager-rankings';
            break;
          case 'c-level':
            route = '/clevel-dashboard';
            break;
          case 'branch-manager':
            route = '/bm-rankings';
            break;
        }
      }
    } catch (_) {}
    if (!mounted) return;
    Navigator.pushReplacementNamed(context, route);
    // If a notification cold-launched the app, open its target now — ON TOP of
    // the dashboard we just landed on, so it isn't clobbered and Back returns
    // here. No-op when nothing is pending (normal launch).
    FirebaseMessagingService.handlePendingInitialMessage();
  }

  @override
  void dispose() {
    _fallbackTimer?.cancel();
    _controller?.removeListener(_onTick);
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = _controller;
    return Scaffold(
      backgroundColor: AppColors.bg,
      // Only the animation shows — no logo/spinner placeholder. While the clip
      // loads (a brief moment for a local asset) the plain themed background
      // shows, then the video fades in.
      body: Center(
        child: (c != null && c.value.isInitialized)
            ? AspectRatio(
                aspectRatio: c.value.aspectRatio,
                child: VideoPlayer(c),
              )
            : const SizedBox.shrink(),
      ),
    );
  }
}
