import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:app_links/app_links.dart';
import 'package:firebase_core/firebase_core.dart';
import 'firebase_options.dart';
import 'services/firebase_messaging_service.dart';
import 'screens/splash_screen.dart';
import 'screens/login_screen.dart';
import 'screens/training_screen.dart';
import 'screens/manager_dashboard_screen.dart';
import 'screens/storm_chat_screen.dart';
import 'screens/storm_chat_room_screen.dart';
import 'screens/rankings_screen.dart';
import 'screens/planner_screen.dart';
import 'screens/courses_screen.dart';
import 'screens/course_detail_screen.dart';
import 'screens/manager_storm_chat_screen.dart';
import 'screens/manager_rankings_screen.dart';
import 'screens/manager_planner_screen.dart';
import 'screens/manager_courses_screen.dart';
import 'screens/manager_training_screen.dart';
import 'screens/manager_profile_screen.dart';
import 'screens/manager_view_team_screen.dart';
import 'screens/manager_team_member_detail_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/ticket_screen.dart';
import 'services/api_client.dart';
import 'screens/apps_tools_items_screen.dart';
import 'screens/apps_tools_detail_screen.dart';
import 'screens/manager_apps_tools_items_screen.dart';
import 'screens/manager_apps_tools_detail_screen.dart';
import 'screens/manager_all_plans_screen.dart';
import 'screens/ai_clone_chat_screen.dart';
import 'screens/register_screen.dart';
import 'screens/forgot_password_screen.dart';
import 'screens/reset_password_screen.dart';
import 'screens/training_leaderboard_screen.dart';
import 'screens/manager_training_leaderboard_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Android 15 (target SDK 35) enforces edge-to-edge display. Opt in globally
  // so the app draws behind the system bars for ALL users (fixes Play Console's
  // "edge-to-edge may not display for all users"). We set only the system-bar
  // ICON brightness — not the bar COLORS — because setStatusBarColor /
  // setNavigationBarColor are deprecated on Android 15 and would trigger the
  // "deprecated APIs for edge-to-edge" warning. Under edge-to-edge the bars are
  // transparent automatically, so no colors are needed.
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarIconBrightness: Brightness.dark,
    systemNavigationBarIconBrightness: Brightness.dark,
  ));

  try {
    // Initialize Firebase with platform-specific options
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
    print('✅ Firebase initialized');
    
    // Initialize messaging service only if Firebase is initialized
    await FirebaseMessagingService.initialize();
    print('✅ Firebase Messaging initialized');
  } catch (e) {
    print('⚠️ Firebase initialization failed: $e');
    print('⚠️ App will run without push notifications');
  }
  
  runApp(const MillerStormApp());
}

class MillerStormApp extends StatefulWidget {
  const MillerStormApp({super.key});

  @override
  State<MillerStormApp> createState() => _MillerStormAppState();
}

class _MillerStormAppState extends State<MillerStormApp> {
  // Shared with the API client (see api_client.dart) so a 401 can force re-login.
  final GlobalKey<NavigatorState> navigatorKey = appNavigatorKey;

  final AppLinks _appLinks = AppLinks();
  StreamSubscription<Uri>? _linkSub;

  @override
  void initState() {
    super.initState();
    // Pass navigator key to messaging service
    FirebaseMessagingService.setNavigatorKey(navigatorKey);
    _initDeepLinks();
  }

  @override
  void dispose() {
    _linkSub?.cancel();
    super.dispose();
  }

  /// Listens for `millerstorm://reset-password?token=...` deep links (emailed
  /// when a reset is requested from the app) and routes to the native Reset
  /// Password screen. Handles both a cold start (initial link) and links that
  /// arrive while the app is already running.
  Future<void> _initDeepLinks() async {
    _linkSub = _appLinks.uriLinkStream.listen(_handleUri, onError: (_) {});
    try {
      final initial = await _appLinks.getInitialLink();
      if (initial != null) _handleUri(initial);
    } catch (_) {
      // Ignore malformed initial links.
    }
  }

  void _handleUri(Uri uri) {
    if (uri.scheme == 'millerstorm' && uri.host == 'reset-password') {
      final token = uri.queryParameters['token'] ?? '';
      WidgetsBinding.instance.addPostFrameCallback((_) {
        navigatorKey.currentState?.pushNamed('/reset-password', arguments: token);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: navigatorKey,
      title: 'Miller Storm',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFFCB0002)),
        fontFamily: 'sans-serif',
        useMaterial3: true,
      ),
      initialRoute: '/',
      onGenerateRoute: (settings) {
        switch (settings.name) {
          case '/':
            return MaterialPageRoute(builder: (_) => const SplashScreen());
          case '/login':
            return MaterialPageRoute(builder: (_) => const LoginScreen());
          case '/register':
            return MaterialPageRoute(builder: (_) => const RegisterScreen());
          case '/forgot-password':
            return MaterialPageRoute(builder: (_) => const ForgotPasswordScreen());
          case '/reset-password':
            final token = settings.arguments as String? ?? '';
            return MaterialPageRoute(builder: (_) => ResetPasswordScreen(token: token));
          case '/training':
            return MaterialPageRoute(builder: (_) => const TrainingScreen());
          case '/manager-dashboard':
            return MaterialPageRoute(builder: (_) => const ManagerDashboardScreen());
          case '/stormchat':
            return MaterialPageRoute(builder: (_) => const StormChatScreen());
          case '/rankings':
            return MaterialPageRoute(builder: (_) => const RankingsScreen());
          case '/planner':
            return MaterialPageRoute(builder: (_) => const PlannerScreen());
          case '/courses':
            return MaterialPageRoute(builder: (_) => CoursesScreen());
          case '/training-leaderboard':
            return MaterialPageRoute(builder: (_) => const TrainingLeaderboardScreen());
          case '/apps-tools-items':
            return MaterialPageRoute(builder: (_) => const AppsToolsItemsScreen());
          case '/apps-tools-detail':
            return MaterialPageRoute(builder: (_) => const AppsToolsDetailScreen(), settings: settings);
          case '/manager-apps-tools-items':
            return MaterialPageRoute(builder: (_) => const ManagerAppsToolsItemsScreen());
          case '/manager-apps-tools-detail':
            return MaterialPageRoute(builder: (_) => const ManagerAppsToolsDetailScreen(), settings: settings);
          case '/manager-all-plans':
            final args = settings.arguments as Map<String, dynamic>;
            return MaterialPageRoute(
              builder: (_) => ManagerAllPlansScreen(
                teamMembers: args['teamMembers'],
                calculateMetrics: args['calculateMetrics'],
                onSavePlan: args['onSavePlan'],
                onRefresh: args['onRefresh'],
              ),
            );
          case '/manager-stormchat':
            return MaterialPageRoute(builder: (_) => const ManagerStormChatScreen());
          case '/manager-rankings':
            return MaterialPageRoute(builder: (_) => const ManagerRankingsScreen());
          case '/manager-view-team':
            return MaterialPageRoute(builder: (_) => const ManagerViewTeamScreen());
          case '/manager-team-member-detail':
            final member = settings.arguments as Map<String, dynamic>;
            return MaterialPageRoute(builder: (_) => ManagerTeamMemberDetailScreen(member: member));
          case '/manager-planner':
            return MaterialPageRoute(builder: (_) => const ManagerPlannerScreen());
          case '/manager-courses':
            return MaterialPageRoute(builder: (_) => const ManagerCoursesScreen());
          case '/manager-training':
            return MaterialPageRoute(builder: (_) => const ManagerTrainingScreen());
          case '/manager-training-leaderboard':
            return MaterialPageRoute(builder: (_) => const ManagerTrainingLeaderboardScreen());
          case '/manager-profile':
            return MaterialPageRoute(builder: (_) => const ManagerProfileScreen());
          case '/profile':
            return MaterialPageRoute(builder: (_) => const ProfileScreen());
          case '/tickets':
            return MaterialPageRoute(builder: (_) => const TicketScreen());
          default:
            return MaterialPageRoute(builder: (_) => const SplashScreen());
        }
      },
    );
  }
}
