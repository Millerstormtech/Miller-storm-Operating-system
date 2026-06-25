import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../services/api_client.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter_html/flutter_html.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/auth_service.dart';

/// Order pages to match the folder-grouped module list, exactly like the web:
/// non-folder pages first, then each folder's pages (in folder order, keeping
/// each page's original order within its folder), then any orphaned pages
/// (folderId pointing at a missing folder). Navigation ("Next") and the lock
/// check MUST use this order so they never skip lessons/quizzes or jump across
/// modules. Shared by course_detail_screen.dart (which imports this file).
List<dynamic> orderPagesByFolder(List<dynamic> pages, List<dynamic> folders) {
  final known = folders.map((f) => f['id']).toSet();
  final result = <dynamic>[];
  result.addAll(pages.where((p) => p['folderId'] == null));
  for (final f in folders) {
    result.addAll(pages.where((p) => p['folderId'] == f['id']));
  }
  result.addAll(pages.where((p) => p['folderId'] != null && !known.contains(p['folderId'])));
  return result;
}

class LessonPlayerScreen extends StatefulWidget {
  final String courseId;
  final String courseTitle;
  final String lessonId;
  final String lessonTitle;
  final List<String>? playlistModules;

  const LessonPlayerScreen({
    super.key,
    required this.courseId,
    required this.courseTitle,
    required this.lessonId,
    required this.lessonTitle,
    this.playlistModules,
  });

  @override
  State<LessonPlayerScreen> createState() => _LessonPlayerScreenState();
}

class _LessonPlayerScreenState extends State<LessonPlayerScreen> {
  static const _bg = Color(0xFFF3F4F6);
  static const _white = Color(0xFFFFFFFF);
  static const _primary = Color(0xFFCB0002);
  static const _textDark = Color(0xFF111827);
  static const _textMedium = Color(0xFF374151);
  static const _textLight = Color(0xFF6B7280);
  static const _border = Color(0xFFD1D5DB);

  Map<String, dynamic>? _lesson;
  Map<String, dynamic>? _course;
  List<dynamic> _allLessons = [];
  int _currentLessonIndex = 0;
  int _completedCount = 0;
  int _totalCount = 0;
  int _progressPercent = 0;
  bool _isLoading = true;
  bool _isFullscreen = false;
  bool _videoError = false;
  bool _videoLoading = true;
  bool _isLessonCompleted = false;
  bool _canGoNext = false;
  WebViewController? _webViewController;
  
  // Quiz state
  Map<String, int> _selectedAnswers = {};
  bool _quizSubmitted = false;
  Map<String, dynamic>? _quizScore;
  List<dynamic> _savedQuizResults = [];
  // Quiz gating: shuffled question order (per user / per attempt) and the
  // failed-attempt counter (1st fail -> try again, 2nd fail -> relearn).
  List<dynamic> _shuffledQuestions = [];
  int _quizAttempts = 0;
  
  // AI Chat state
  Map<String, dynamic>? _courseBot;
  bool _showAIChat = false;

  @override
  void initState() {
    super.initState();
    _initWebViewController();
    _fetchLessonData();
  }

  void _initWebViewController() {
    late final PlatformWebViewControllerCreationParams params;
    if (WebViewPlatform.instance is WebKitWebViewPlatform) {
      params = WebKitWebViewControllerCreationParams(
        allowsInlineMediaPlayback: true,
        mediaTypesRequiringUserAction: const <PlaybackMediaTypes>{},
      );
    } else {
      params = const PlatformWebViewControllerCreationParams();
    }

    _webViewController = WebViewController.fromPlatformCreationParams(params)
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.black)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            if (mounted) setState(() => _videoLoading = true);
          },
          onPageFinished: (_) {
            if (mounted) setState(() => _videoLoading = false);
          },
          onWebResourceError: (error) {
            print('🎥 WebView error: ${error.description}');
            if (mounted) setState(() {
              _videoLoading = false;
              _videoError = true;
            });
          },
        ),
      )
      ..addJavaScriptChannel(
        'VideoEndChannel',
        onMessageReceived: (JavaScriptMessage message) {
          print('🎬 Video ended - enabling next button');
          if (mounted) {
            setState(() {
              _canGoNext = true;
            });
          }
        },
      )
      ..addJavaScriptChannel(
        'SeekBlockedChannel',
        onMessageReceived: (JavaScriptMessage message) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text(
                  'You are only able to fast forward if you already completed the video at least once before.',
                ),
                backgroundColor: Color(0xFF3B82F6),
                behavior: SnackBarBehavior.floating,
                duration: Duration(seconds: 4),
              ),
            );
          }
        },
      );

    // Set Android-specific settings if on Android
    if (WebViewPlatform.instance is AndroidWebViewController) {
      final androidController = _webViewController!.platform as AndroidWebViewController;
      androidController.setMediaPlaybackRequiresUserGesture(false);
    }
  }

  Future<void> _fetchLessonData() async {
    try {
      final user = await AuthService.getStoredUser();
      final userId = user?['id'] ?? '';
      
      print('🎥 Fetching lesson: ${widget.lessonId} from course: ${widget.courseId}');
      
      // Fetch course AI bot configuration
      _fetchCourseBot();
      
      // Get course data with lesson details
      final response = await api.get(
        Uri.parse('https://millerstorm.tech/api/courses/${widget.courseId}?userId=$userId'),
      );

      if (response.statusCode == 200) {
        final courseData = jsonDecode(response.body);
        final pages = courseData['pages'] as List<dynamic>? ?? [];
        
        // Filter only published pages (including quizzes)
        var lessons = pages.where((page) => 
          page['status'] == 'published'
        ).toList();
        
        // If viewing a playlist, filter to only playlist modules
        if (widget.playlistModules != null) {
          lessons = lessons.where((page) => widget.playlistModules!.contains(page['id'])).toList();
        }
        
        // Order pages like the folder-grouped module list (non-folder pages
        // first, then each folder's pages in order) — same as the web. Keeps
        // "Next" from skipping lessons/quizzes or jumping across modules.
        final folders = courseData['folders'] as List<dynamic>? ?? [];
        lessons = orderPagesByFolder(lessons, folders);
        
        print('📚 Total pages loaded: ${lessons.length}');
        if (widget.playlistModules != null) {
          print('🎵 Playlist mode: showing ${lessons.length} modules');
        }
        
        final currentIndex = lessons.indexWhere((page) => page['id'] == widget.lessonId);
        final lesson = currentIndex >= 0 ? lessons[currentIndex] : null;

        // Load saved progress (including quiz results)
        List<dynamic> savedQuizResults = [];
        int completedCount = 0;
        int totalCount = lessons.length;
        int progressPercent = 0;
        bool isCurrentLessonCompleted = false;
        
        if (userId.isNotEmpty) {
          try {
            final progressResponse = await api.get(
              Uri.parse('https://millerstorm.tech/api/progress?userId=$userId&courseId=${widget.courseId}'),
            );
            if (progressResponse.statusCode == 200) {
              final progressData = jsonDecode(progressResponse.body);
              savedQuizResults = progressData['quizResults'] ?? [];
              
              final completedPages = progressData['completedPages'] as List<dynamic>? ?? [];
              isCurrentLessonCompleted = completedPages.contains(widget.lessonId);
              
              // Get counts and percentage from API if available, otherwise calculate
              if (progressData['completedLessons'] != null) {
                completedCount = progressData['completedLessons'];
                totalCount = progressData['totalLessons'] ?? lessons.length;
                progressPercent = progressData['progressPercent'] ?? 0;
              } else {
                completedCount = completedPages.length;
                progressPercent = totalCount > 0 ? ((completedCount / totalCount) * 100).round() : 0;
              }
              
              print('📊 Loaded ${savedQuizResults.length} saved quiz results');
              print('📊 Progress: $completedCount/$totalCount ($progressPercent%)');
              print('📊 Is current lesson completed: $isCurrentLessonCompleted');
            }
          } catch (e) {
            print('⚠️ Could not load progress: $e');
          }
        }

        setState(() {
          _course = courseData;
          _lesson = lesson;
          _allLessons = lessons;
          _currentLessonIndex = currentIndex >= 0 ? currentIndex : 0;
          _completedCount = completedCount;
          _totalCount = totalCount;
          _progressPercent = progressPercent;
          _savedQuizResults = savedQuizResults;
          _isLessonCompleted = isCurrentLessonCompleted;
          _canGoNext = isCurrentLessonCompleted;
          _isLoading = false;
          _videoError = false;
          _videoLoading = true;
          
          // If this is a quiz, check if user already completed it
          if (lesson?['isQuiz'] == true) {
            // Shuffle the question order (different per user / per attempt).
            _shuffledQuestions = List<dynamic>.from(lesson!['quizQuestions'] ?? [])..shuffle();

            final savedResult = savedQuizResults.firstWhere(
              (r) => r['pageId'] == lesson!['id'],
              orElse: () => null,
            );

            if (savedResult != null) {
              print('✅ Found saved quiz result');
              _selectedAnswers = Map<String, int>.from(savedResult['answers'] ?? {});
              _quizScore = savedResult['score'];
              _quizSubmitted = true;
            }
          }
        });

        // Load video into WebView if available
        if (lesson != null && lesson['videoUrl'] != null && lesson['videoUrl'].toString().trim().isNotEmpty) {
          final embedUrl = _getEmbedUrl(lesson['videoUrl']);
          _webViewController?.loadHtmlString(
            _buildVideoHtml(embedUrl, _isLessonCompleted),
            baseUrl: 'https://millerstorm.tech',
          );
        } else if (lesson != null && lesson['isQuiz'] != true) {
          // No video and not a quiz, enable next after a small delay
          Future.delayed(const Duration(milliseconds: 1500), () {
            if (mounted) {
              setState(() => _canGoNext = true);
            }
          });
        }
        
        print('✅ Lesson loaded: ${lesson?['title']}');
      } else {
        setState(() => _isLoading = false);
      }
    } catch (e) {
      print('❌ Error fetching lesson: $e');
      setState(() => _isLoading = false);
    }
  }

  String _buildVideoHtml(String embedUrl, bool isCompleted) {
    final isDirectVideo = embedUrl.contains('/uploads/') || 
                          embedUrl.endsWith('.mp4') || 
                          embedUrl.endsWith('.mov') || 
                          embedUrl.endsWith('.webm') ||
                          embedUrl.contains('.mp4?') ||
                          embedUrl.contains('.mov?') ||
                          embedUrl.contains('.webm?');
    
    if (isDirectVideo) {
      return '''
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; background: #000; overflow: hidden; display: flex; align-items: center; justify-content: center; }
  video { width: 100%; height: 100%; object-fit: contain; }
  .error { color: white; text-align: center; padding: 20px; font-family: system-ui; }
  .retry { background: #CB0002; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; margin-top: 10px; font-size: 16px; }
</style>
</head>
<body>
<div id="container">
  <video id="player" controls playsinline webkit-playsinline x-webkit-airplay="allow" preload="auto">
    <source src="$embedUrl" type="video/mp4">
    <div class="error">
      <p>Video couldn't load</p>
      <button class="retry" onclick="location.reload()">Retry</button>
    </div>
  </video>
</div>
<script>
  var video = document.getElementById('player');
  var maxTimeWatched = 0;
  var isSeeking = false;
  var isCompleted = $isCompleted;
  var lastBlockNotice = 0;
  function notifyBlocked() {
    var now = Date.now();
    if (now - lastBlockNotice < 3000) return;
    lastBlockNotice = now;
    if (window.SeekBlockedChannel) { window.SeekBlockedChannel.postMessage('blocked'); }
  }

  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  
  video.onseeking = function() {
    isSeeking = true;
  };

  video.onseeked = function() {
    isSeeking = false;
  };

  video.ontimeupdate = function() {
    if (!isCompleted && !isSeeking) {
      if (video.currentTime > maxTimeWatched + 2) {
        video.currentTime = maxTimeWatched;
        notifyBlocked();
      } else {
        maxTimeWatched = Math.max(maxTimeWatched, video.currentTime);
      }
    }
  };
  
  video.onerror = function() {
    console.log('Video error');
  };
  
  video.onended = function() {
    if (window.VideoEndChannel) {
      window.VideoEndChannel.postMessage('ended');
    }
  };
  
  // Try to autoplay, but handle user gesture requirement
  video.play().catch(function(e) {
    console.log('Autoplay blocked, waiting for user interaction');
  });
</script>
</body>
</html>''';
    }

    final isYouTube = embedUrl.contains('youtube.com') || embedUrl.contains('youtu.be');
    final isVimeo = embedUrl.contains('vimeo.com');

    return '''
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; background: #000; overflow: hidden; }
  iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; }
</style>
</head>
<body>
<div id="player-container">
  <iframe
    id="player"
    src="$embedUrl${embedUrl.contains('?') ? '&' : '?'}enablejsapi=1"
    allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
    allowfullscreen
    webkitallowfullscreen
    mozallowfullscreen>
  </iframe>
</div>

${isVimeo ? '<script src="https://player.vimeo.com/api/player.js"></script>' : ''}
${isYouTube ? '<script src="https://www.youtube.com/iframe_api"></script>' : ''}

<script>
  var iframe = document.getElementById('player');
  var maxTimeWatched = 0;
  var checkInterval;
  var isCompleted = $isCompleted;
  var lastBlockNotice = 0;
  function notifyBlocked() {
    var now = Date.now();
    if (now - lastBlockNotice < 3000) return;
    lastBlockNotice = now;
    if (window.SeekBlockedChannel) { window.SeekBlockedChannel.postMessage('blocked'); }
  }

  function initVimeo() {
    if (window.Vimeo) {
      var player = new Vimeo.Player(iframe);
      
      player.on('timeupdate', function(data) {
        if (!isCompleted) {
          if (data.seconds > maxTimeWatched + 2) {
            player.setCurrentTime(maxTimeWatched);
            notifyBlocked();
          } else {
            maxTimeWatched = Math.max(maxTimeWatched, data.seconds);
          }
        }
      });

      player.on('seeking', function(data) {
        if (!isCompleted && data.seconds > maxTimeWatched + 1) {
          player.setCurrentTime(maxTimeWatched);
          notifyBlocked();
        }
      });

      player.on('ended', function() {
        if (window.VideoEndChannel) {
          window.VideoEndChannel.postMessage('ended');
        }
      });
    }
  }

  function onYouTubeIframeAPIReady() {
    var player = new YT.Player('player', {
      events: {
        'onStateChange': onPlayerStateChange,
        'onReady': onPlayerReady
      }
    });

    function onPlayerReady() {
      if (!isCompleted) {
        checkInterval = setInterval(function() {
          var currentTime = player.getCurrentTime();
          if (currentTime > maxTimeWatched + 2) {
            player.seekTo(maxTimeWatched, true);
            notifyBlocked();
          } else {
            maxTimeWatched = Math.max(maxTimeWatched, currentTime);
          }
        }, 500);
      }
    }

    function onPlayerStateChange(event) {
      if (event.data === YT.PlayerState.ENDED) {
        if (window.VideoEndChannel) {
          window.VideoEndChannel.postMessage('ended');
        }
      }
    }
  }

  if (window.Vimeo) {
    initVimeo();
  } else if (iframe.src.indexOf('vimeo.com') !== -1) {
    iframe.onload = initVimeo;
  }
</script>
</body>
</html>''';
  }

  String _getEmbedUrl(String videoUrl) {
    print('🔗 Original video URL: $videoUrl');
    
    // Handle relative URLs for uploaded files
    if (videoUrl.startsWith('/uploads/')) {
      final absoluteUrl = 'https://millerstorm.tech$videoUrl';
      print('✅ Absolute uploaded video URL: $absoluteUrl');
      return absoluteUrl;
    }
    
    // Handle relative URLs that don't start with /uploads/
    if (!videoUrl.startsWith('http://') && !videoUrl.startsWith('https://')) {
      final absoluteUrl = 'https://millerstorm.tech$videoUrl';
      print('✅ Absolute relative URL: $absoluteUrl');
      return absoluteUrl;
    }

    // Convert various video URL formats to embeddable URLs
    if (videoUrl.contains('vimeo.com')) {
      // Extract video ID and hash from various Vimeo URL formats
      final vimeoMatch = RegExp(r'vimeo\.com/(\d+)(?:/([a-zA-Z0-9]+))?').firstMatch(videoUrl);
      if (vimeoMatch != null) {
        final videoId = vimeoMatch.group(1);
        final hash = vimeoMatch.group(2);
        // Use Vimeo player with playsinline enabled
        final embedUrl = hash != null 
          ? 'https://player.vimeo.com/video/$videoId?h=$hash&autoplay=1&playsinline=1&controls=1&muted=0&autopause=0&title=0&byline=0&portrait=0'
          : 'https://player.vimeo.com/video/$videoId?autoplay=1&playsinline=1&controls=1&muted=0&autopause=0&title=0&byline=0&portrait=0';
        print('✅ Vimeo embed URL: $embedUrl');
        return embedUrl;
      }
    } else if (videoUrl.contains('youtube.com') || videoUrl.contains('youtu.be')) {
      final youtubeMatch = RegExp(r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([^&\n?#]+)').firstMatch(videoUrl);
      if (youtubeMatch != null) {
        final videoId = youtubeMatch.group(1);
        final embedUrl = 'https://www.youtube.com/embed/$videoId?playsinline=1&controls=1&rel=0&autoplay=1&modestbranding=1';
        print('✅ YouTube embed URL: $embedUrl');
        return embedUrl;
      }
    } else if (videoUrl.contains('loom.com')) {
      final loomMatch = RegExp(r'loom\.com/share/([a-zA-Z0-9]+)').firstMatch(videoUrl);
      if (loomMatch != null) {
        final videoId = loomMatch.group(1);
        final embedUrl = 'https://www.loom.com/embed/$videoId?autoplay=1&playsinline=1&hide_owner=true&hide_share=true&hide_title=true';
        print('✅ Loom embed URL: $embedUrl');
        return embedUrl;
      }
    } else if (videoUrl.contains('wistia.com')) {
      final wistiaMatch = RegExp(r'wistia\.com/medias/([a-zA-Z0-9]+)').firstMatch(videoUrl);
      if (wistiaMatch != null) {
        final videoId = wistiaMatch.group(1);
        final embedUrl = 'https://fast.wistia.net/embed/iframe/$videoId?autoplay=1&playsinline=1';
        print('✅ Wistia embed URL: $embedUrl');
        return embedUrl;
      }
    }
    
    // If it's already an absolute URL but not from a known provider, use as is
    print('✅ Using original URL: $videoUrl');
    return videoUrl;
  }

  void _toggleFullscreen() {
    setState(() {
      _isFullscreen = !_isFullscreen;
    });
    
    if (_isFullscreen) {
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
      SystemChrome.setPreferredOrientations([
        DeviceOrientation.landscapeLeft,
        DeviceOrientation.landscapeRight,
      ]);
    } else {
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
      SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
    }
  }

  Future<void> _submitQuiz() async {
    if (_lesson == null || _lesson!['quizQuestions'] == null) return;
    
    final questions = _lesson!['quizQuestions'] as List<dynamic>? ?? [];
    int correct = 0;
    
    for (var q in questions) {
      final questionId = q['id'];
      final correctIndex = q['correctIndex'];
      if (_selectedAnswers[questionId] == correctIndex) {
        correct++;
      }
    }
    
    final total = questions.length;
    final score = {
      'correct': correct,
      'total': total,
    };
    final pct = total > 0 ? correct / total : 0.0;
    final passed = pct >= 0.6; // 60% to pass

    setState(() {
      _quizSubmitted = true;
      _quizScore = score;
    });

    if (!passed) {
      // Failed (< 60%): do NOT save a pass and do NOT advance. Show top-up.
      _quizAttempts++;
      if (_quizAttempts >= 2) {
        _quizAttempts = 0; // reset for after the relearn
        _showQuizFailDialog(pct, relearn: true);
      } else {
        _showQuizFailDialog(pct, relearn: false);
      }
      return;
    }

    // Passed: save the result and advance.
    try {
      final user = await AuthService.getStoredUser();
      final userId = user?['id'] ?? '';

      if (userId.isNotEmpty) {
        final quizResult = {
          'pageId': _lesson!['id'],
          'answers': _selectedAnswers,
          'score': score,
          'passed': true,
          'submittedAt': DateTime.now().toIso8601String(),
        };

        await api.post(
          Uri.parse('https://millerstorm.tech/api/progress/save'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'userId': userId,
            'courseId': widget.courseId,
            'quizResult': quizResult,
          }),
        );

        print('💾 Quiz result saved to database');
      }
    } catch (e) {
      print('❌ Error saving quiz result: $e');
    }

    // Auto-advance after a short delay
    await Future.delayed(const Duration(milliseconds: 1500));
    _markCompleteAndNext();
  }

  // Top-up dialog shown when a quiz is failed (< 60%).
  void _showQuizFailDialog(double pct, {required bool relearn}) {
    final percent = (pct * 100).round();
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        title: Column(
          children: [
            Text(relearn ? '📚' : '📊', style: const TextStyle(fontSize: 40)),
            const SizedBox(height: 8),
            Text(
              relearn ? "Let's revisit the lesson" : 'Top up your score!',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: _textDark),
            ),
          ],
        ),
        content: Text(
          relearn
              ? "You scored $percent% again. Your performance isn't there yet, so please go through the lesson once more, then retake the quiz."
              : "You scored $percent%. You need 60% to move on. Give it another try — score above 60% and you'll advance to the next step.",
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 14, color: _textLight, height: 1.5),
        ),
        actionsAlignment: MainAxisAlignment.center,
        actions: [
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: _primary,
                foregroundColor: _white,
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
              onPressed: () {
                Navigator.of(ctx).pop();
                if (relearn) {
                  _relearnPreviousLesson();
                } else {
                  _retryQuiz();
                }
              },
              child: Text(relearn ? 'Review Lesson' : 'Try Again'),
            ),
          ),
        ],
      ),
    );
  }

  // Retry the same quiz: reset answers and reshuffle the question order.
  void _retryQuiz() {
    setState(() {
      _quizSubmitted = false;
      _quizScore = null;
      _selectedAnswers = {};
      _shuffledQuestions = List<dynamic>.from(_lesson!['quizQuestions'] ?? [])..shuffle();
    });
  }

  // Send the user back to the lesson immediately before this quiz to relearn it.
  void _relearnPreviousLesson() {
    int prevIdx = _currentLessonIndex - 1;
    while (prevIdx >= 0 && _allLessons[prevIdx]['isQuiz'] == true) {
      prevIdx--;
    }
    if (prevIdx < 0) {
      // No earlier lesson to revisit — just let them retry.
      _retryQuiz();
      return;
    }
    final prevLesson = _allLessons[prevIdx];
    _stopVideo();
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (context) => LessonPlayerScreen(
          courseId: widget.courseId,
          courseTitle: widget.courseTitle,
          lessonId: prevLesson['id'],
          lessonTitle: prevLesson['title'],
          playlistModules: widget.playlistModules,
        ),
      ),
    );
  }
  
  Future<void> _markCompleteAndNext() async {
    if (_lesson == null) return;
    
    try {
      final user = await AuthService.getStoredUser();
      final userId = user?['id'] ?? '';
      
      // Only mark lesson pages as complete (not quizzes)
      if (_lesson!['isQuiz'] != true) {
        final response = await api.post(
          Uri.parse('https://millerstorm.tech/api/progress/save'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'userId': userId,
            'courseId': widget.courseId,
            'pageId': _lesson!['id'],
          }),
        );
        
        if (response.statusCode == 200) {
          final data = jsonDecode(response.body);
          if (data['progress'] != null) {
            setState(() {
              _completedCount = data['progress']['completedLessons'] ?? _completedCount;
              _totalCount = data['progress']['totalLessons'] ?? _totalCount;
              _progressPercent = data['progress']['progressPercent'] ?? _progressPercent;
            });
          }
        }
        
        print('✅ Lesson marked as complete: ${_lesson!['title']}');
      }
      
      // Navigate to next lesson if available
      if (_currentLessonIndex < _allLessons.length - 1) {
        final nextLesson = _allLessons[_currentLessonIndex + 1];
        print('🔄 Navigating to next: ${nextLesson['title']} (isQuiz: ${nextLesson['isQuiz']})');
        _stopVideo();
        
        // Use then() to refresh progress when returning back from nested navigation
        // though here we use pushReplacement, so we should actually just update our state
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (context) => LessonPlayerScreen(
              courseId: widget.courseId,
              courseTitle: widget.courseTitle,
              lessonId: nextLesson['id'],
              lessonTitle: nextLesson['title'],
              playlistModules: widget.playlistModules,
            ),
          ),
        );
      } else {
        // Last lesson - go back to course detail with a result to trigger refresh
        Navigator.pop(context, true);
        final message = widget.playlistModules != null ? '🎉 Playlist completed!' : '🎉 Course completed!';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(message),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      print('❌ Error marking lesson complete: $e');
    }
  }

  Future<void> _fetchCourseBot() async {
    try {
      final response = await api.get(
        Uri.parse('https://millerstorm.tech/api/course-ai-bots'),
      );
      
      if (response.statusCode == 200) {
        final bots = jsonDecode(response.body) as List<dynamic>;
        final publishedBot = bots.firstWhere(
          (bot) => bot['status'] == 'published' && 
                  (bot['selectedCourses'] as List<dynamic>?)?.contains(widget.courseId) == true,
          orElse: () => null,
        );
        
        setState(() {
          _courseBot = publishedBot;
        });
        
        print('🤖 Course bot loaded: ${publishedBot != null}');
      }
    } catch (e) {
      print('❌ Error fetching course bot: $e');
    }
  }

  Future<void> _launchUrl(String url) async {
    try {
      final uri = Uri.parse(url);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    } catch (e) {
      print('❌ Error launching URL: $e');
    }
  }
  
  void _showAIChatDialog() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      isDismissible: true,
      useSafeArea: true,
      builder: (context) => _AIChat(
        lessonTitle: _lesson?['title'] ?? widget.lessonTitle,
        lessonContent: _lesson?['body'] ?? '',
        courseTitle: widget.courseTitle,
      ),
    );
  }

  Widget _buildVideoPlayer() {
    final hasVideoUrl = _lesson?['videoUrl'] != null && _lesson!['videoUrl'].toString().trim().isNotEmpty;
    
    if (!hasVideoUrl) {
      return const SizedBox.shrink();
    }

    return Container(
      height: _isFullscreen ? MediaQuery.of(context).size.height : 220,
      width: double.infinity,
      color: Colors.black,
      child: Stack(
        children: [
          WebViewWidget(controller: _webViewController!),
          
          // Loading indicator
          if (_videoLoading)
            Container(
              color: Colors.black,
              child: const Center(
                child: CircularProgressIndicator(color: Colors.white),
              ),
            ),
          
          // Error state
          if (_videoError)
            Container(
              color: Colors.black,
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error_outline, color: Colors.white, size: 48),
                  const SizedBox(height: 12),
                  const Text(
                    'Video couldn\'t load',
                    style: TextStyle(color: Colors.white, fontSize: 16),
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () {
                      setState(() {
                        _videoError = false;
                        _videoLoading = true;
                      });
                      if (_lesson != null && _lesson!['videoUrl'] != null) {
                        final embedUrl = _getEmbedUrl(_lesson!['videoUrl']);
                        _webViewController?.loadHtmlString(
                          _buildVideoHtml(embedUrl, _isLessonCompleted),
                          baseUrl: 'https://millerstorm.tech',
                        );
                      }
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _primary,
                      foregroundColor: Colors.white,
                    ),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          
          // Fullscreen button
          if (!_isFullscreen && !_videoLoading && !_videoError)
            Positioned(
              top: 8,
              right: 8,
              child: GestureDetector(
                onTap: _toggleFullscreen,
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.black54,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(
                    Icons.fullscreen,
                    color: Colors.white,
                    size: 24,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildQuizContent() {
    if (_lesson?['quizQuestions'] == null) {
      return const SizedBox();
    }

    final questions = _shuffledQuestions.isNotEmpty
        ? _shuffledQuestions
        : (_lesson!['quizQuestions'] as List<dynamic>? ?? []);
    
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _white,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Score display (if submitted)
          if (_quizSubmitted && _quizScore != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: _quizScore!['correct'] == _quizScore!['total']
                    ? const Color(0xFFD1FAEC)
                    : const Color(0xFFFEF3C7),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                children: [
                  Text(
                    'Score: ${_quizScore!['correct']}/${_quizScore!['total']}',
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      color: _textDark,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _quizScore!['correct'] == _quizScore!['total']
                        ? 'Perfect! 🎉'
                        : 'You got ${((_quizScore!['correct'] / _quizScore!['total']) * 100).round()}%',
                    style: const TextStyle(
                      fontSize: 14,
                      color: Color(0xFF666666),
                    ),
                  ),
                ],
              ),
            ),
          
          // Questions
          ...questions.asMap().entries.map((entry) {
            final qIdx = entry.key;
            final q = entry.value;
            final questionId = q['id'];
            final options = q['options'] as List<dynamic>? ?? [];
            final correctIndex = q['correctIndex'];
            
            return Container(
              margin: const EdgeInsets.only(bottom: 32),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Question ${qIdx + 1}: ${q['prompt']}',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: _textDark,
                    ),
                  ),
                  const SizedBox(height: 16),
                  
                  // Options
                  ...options.asMap().entries.map((optEntry) {
                    final optIdx = optEntry.key;
                    final option = optEntry.value;
                    final isSelected = _selectedAnswers[questionId] == optIdx;
                    final isCorrect = correctIndex == optIdx;
                    final showResult = _quizSubmitted;
                    
                    Color borderColor;
                    Color bgColor;
                    
                    if (showResult) {
                      if (isCorrect) {
                        borderColor = const Color(0xFF10B981);
                        bgColor = const Color(0xFFD1FAEC);
                      } else if (isSelected) {
                        borderColor = const Color(0xFFEF4444);
                        bgColor = const Color(0xFFFEE2E2);
                      } else {
                        borderColor = _border;
                        bgColor = _white;
                      }
                    } else {
                      borderColor = isSelected ? _primary : _border;
                      bgColor = isSelected ? const Color(0xFFEFF6FF) : _white;
                    }
                    
                    return GestureDetector(
                      onTap: _quizSubmitted ? null : () {
                        setState(() {
                          _selectedAnswers[questionId] = optIdx;
                        });
                      },
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: BoxDecoration(
                          color: bgColor,
                          border: Border.all(color: borderColor, width: 2),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 20,
                              height: 20,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: showResult
                                      ? (isCorrect ? const Color(0xFF10B981) : isSelected ? const Color(0xFFEF4444) : _border)
                                      : (isSelected ? _primary : _border),
                                  width: 2,
                                ),
                                color: isSelected
                                    ? (showResult
                                        ? (isCorrect ? const Color(0xFF10B981) : const Color(0xFFEF4444))
                                        : _primary)
                                    : _white,
                              ),
                              child: isSelected
                                  ? const Center(
                                      child: Icon(
                                        Icons.circle,
                                        size: 8,
                                        color: _white,
                                      ),
                                    )
                                  : null,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                option.toString(),
                                style: const TextStyle(
                                  fontSize: 14,
                                  color: _textDark,
                                ),
                              ),
                            ),
                            if (showResult && isCorrect)
                              const Icon(
                                Icons.check,
                                color: Color(0xFF10B981),
                                size: 20,
                              ),
                          ],
                        ),
                      ),
                    );
                  }).toList(),
                ],
              ),
            );
          }).toList(),
        ],
      ),
    );
  }

  Widget _buildLessonContent() {
    if (_lesson?['body'] == null || _lesson!['body'].toString().trim().isEmpty) {
      return const SizedBox();
    }

    String htmlContent = _lesson!['body'];
    
    // Remove video containers (video is shown separately at top)
    htmlContent = htmlContent.replaceAll(RegExp(r'<div[^>]*data-video-type[^>]*>.*?</div>', dotAll: true), '');
    
    // Remove delete buttons and their SVG icons, but keep images
    htmlContent = htmlContent.replaceAll(RegExp(r'<button[^>]*data-image-delete[^>]*>.*?</button>', dotAll: true), '');
    htmlContent = htmlContent.replaceAll(RegExp(r'<button[^>]*data-video-delete[^>]*>.*?</button>', dotAll: true), '');
    htmlContent = htmlContent.replaceAll(RegExp(r'<button[^>]*data-video-share[^>]*>.*?</button>', dotAll: true), '');
    
    // Remove excessive empty paragraphs and breaks
    htmlContent = htmlContent.replaceAll(RegExp(r'(<p>\s*<br\s*/?>\s*</p>\s*){2,}'), '<p><br></p>');
    htmlContent = htmlContent.replaceAll(RegExp(r'(<br\s*/?>\s*){4,}'), '<br><br>');
    
    // Fix image URLs to be absolute
    htmlContent = htmlContent.replaceAll(
      RegExp(r'<img\s+src="/uploads/'),
      '<img src="https://millerstorm.tech/uploads/',
    );
    
    // Check if content is empty after cleanup
    String testContent = htmlContent.replaceAll(RegExp(r'<[^>]*>'), '').trim();
    if (testContent.isEmpty) return const SizedBox();

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _white,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Html(
        data: htmlContent,
        style: {
          "body": Style(
            margin: Margins.zero,
            padding: HtmlPaddings.zero,
            fontSize: FontSize(15),
            lineHeight: LineHeight(1.6),
            color: _textMedium,
          ),
          "h1": Style(
            fontSize: FontSize(22),
            fontWeight: FontWeight.bold,
            color: _textDark,
            margin: Margins.only(top: 12, bottom: 10),
          ),
          "h2": Style(
            fontSize: FontSize(18),
            fontWeight: FontWeight.bold,
            color: _textDark,
            margin: Margins.only(top: 16, bottom: 8),
          ),
          "h3": Style(
            fontSize: FontSize(16),
            fontWeight: FontWeight.w600,
            color: _textDark,
            margin: Margins.only(top: 14, bottom: 8),
          ),
          "h4": Style(
            fontSize: FontSize(15),
            fontWeight: FontWeight.w600,
            color: _textDark,
            margin: Margins.only(top: 12, bottom: 6),
          ),
          "p": Style(
            fontSize: FontSize(15),
            lineHeight: LineHeight(1.6),
            color: _textMedium,
            margin: Margins.only(bottom: 10),
          ),
          "div": Style(
            margin: Margins.only(bottom: 8),
          ),
          "span": Style(
            fontSize: FontSize(15),
            lineHeight: LineHeight(1.6),
          ),
          "ul": Style(
            margin: Margins.only(left: 8, bottom: 10),
            padding: HtmlPaddings.only(left: 16),
          ),
          "ol": Style(
            margin: Margins.only(left: 8, bottom: 10),
            padding: HtmlPaddings.only(left: 16),
          ),
          "li": Style(
            fontSize: FontSize(15),
            lineHeight: LineHeight(1.6),
            color: _textMedium,
            margin: Margins.only(bottom: 6),
          ),
          "strong": Style(
            fontWeight: FontWeight.bold,
            color: _textDark,
          ),
          "b": Style(
            fontWeight: FontWeight.bold,
            color: _textDark,
          ),
          "em": Style(
            fontStyle: FontStyle.italic,
          ),
          "i": Style(
            fontStyle: FontStyle.italic,
          ),
          "a": Style(
            color: _primary,
            textDecoration: TextDecoration.underline,
          ),
          "img": Style(
            width: Width(100, Unit.percent),
            height: Height.auto(),
            margin: Margins.only(top: 12, bottom: 12),
            display: Display.block,
          ),
          "hr": Style(
            margin: Margins.only(top: 16, bottom: 16),
            border: Border(bottom: BorderSide(color: _border, width: 1)),
          ),
          "blockquote": Style(
            margin: Margins.only(left: 12, top: 10, bottom: 10),
            padding: HtmlPaddings.only(left: 12),
            border: Border(left: BorderSide(color: _primary, width: 3)),
            backgroundColor: _bg,
          ),
          "code": Style(
            backgroundColor: _bg,
            padding: HtmlPaddings.all(4),
            fontFamily: 'monospace',
          ),
          "pre": Style(
            backgroundColor: _bg,
            padding: HtmlPaddings.all(12),
            margin: Margins.only(bottom: 10),
          ),
        },
        extensions: [
          TagExtension(
            tagsToExtend: const {"img"},
            builder: (extensionContext) {
              final src = extensionContext.attributes['src'] ?? '';
              print('🖼️ Image src: $src');
              
              if (src.isEmpty) {
                print('❌ Empty image src');
                return const SizedBox();
              }
              
              return Container(
                margin: const EdgeInsets.symmetric(vertical: 12),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: CachedNetworkImage(
                    imageUrl: src,
                    fit: BoxFit.cover,
                    memCacheWidth: 800,
                    maxWidthDiskCache: 800,
                    placeholder: (context, url) {
                      print('⏳ Loading image: $url');
                      return Container(
                        height: 200,
                        color: _bg,
                        child: const Center(
                          child: CircularProgressIndicator(color: _primary),
                        ),
                      );
                    },
                    errorWidget: (context, url, error) {
                      print('❌ Image load error: $url');
                      print('❌ Error details: $error');
                      return Container(
                        padding: const EdgeInsets.all(16),
                        color: _bg,
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.image_not_supported, color: _textLight, size: 48),
                            const SizedBox(height: 8),
                            const Text(
                              'Image not available',
                              style: TextStyle(color: _textLight, fontSize: 14),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              );
            },
          ),
        ],
        onLinkTap: (url, attributes, element) {
          if (url != null) {
            _launchUrl(url);
          }
        },
      ),
    );
  }

  Widget _buildResourceLinks() {
    final resourceLinks = _lesson?['resourceLinks'] as List<dynamic>? ?? [];
    final fileUrls = _lesson?['fileUrls'] as List<dynamic>? ?? [];
    
    // Show Resources section if there are any links or files
    if (resourceLinks.isEmpty && fileUrls.isEmpty) {
      return const SizedBox();
    }

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _white,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Resources',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: _textDark,
            ),
          ),
          const SizedBox(height: 12),
          
          // Resource links
          ...resourceLinks.map((link) => GestureDetector(
            onTap: () => _launchUrl(link['href'] ?? ''),
            child: Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: _bg,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: _border.withOpacity(0.3)),
              ),
              child: Row(
                children: [
                  Icon(Icons.link, color: _primary, size: 18),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      link['label'] ?? 'Resource Link',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: _textDark,
                      ),
                    ),
                  ),
                  Icon(Icons.open_in_new, color: _textLight, size: 14),
                ],
              ),
            ),
          )).toList(),
          
          // File downloads
          ...fileUrls.map((file) {
            final href = file['href'] ?? '';
            final label = file['label'] ?? 'Download File';
            final fullUrl = href.startsWith('http') ? href : 'https://millerstorm.tech$href';
            
            return GestureDetector(
              onTap: () => _launchUrl(fullUrl),
              child: Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: _bg,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: _border.withOpacity(0.3)),
                ),
                child: Row(
                  children: [
                    Icon(Icons.file_download, color: _primary, size: 18),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        label,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                          color: _textDark,
                        ),
                      ),
                    ),
                    Icon(Icons.download, color: _textLight, size: 14),
                  ],
                ),
              ),
            );
          }).toList(),
        ],
      ),
    );
  }

  void _stopVideo() {
    _webViewController?.runJavaScript(
      'try { var v = document.querySelector("video"); if(v){ v.pause(); v.src=""; } var i = document.querySelector("iframe"); if(i){ i.src=""; } } catch(e){}',
    );
  }

  @override
  void dispose() {
    _stopVideo();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_isFullscreen) {
      return Scaffold(
        backgroundColor: Colors.black,
        body: _buildVideoPlayer(),
      );
    }

    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: _textDark),
          onPressed: () {
            _stopVideo();
            Navigator.pop(context);
          },
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.lessonTitle,
              style: const TextStyle(
                color: _textDark,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
            Text(
              widget.courseTitle,
              style: const TextStyle(
                color: _textLight,
                fontSize: 12,
                fontWeight: FontWeight.w400,
              ),
            ),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: _primary))
          : Stack(
              children: [
                Column(
                  children: [
                    // Video Player (only if not quiz and has video)
                    if (_lesson?['isQuiz'] != true && _lesson?['videoUrl'] != null && _lesson!['videoUrl'].toString().trim().isNotEmpty)
                      _buildVideoPlayer(),
                    
                    // Content below video
                    Expanded(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
                        child: Column(
                          children: [
                            // Quiz or Lesson content
                            if (_lesson?['isQuiz'] == true)
                              _buildQuizContent()
                            else
                              _buildLessonContent(),
                            
                            // Resources (only for lessons)
                            if (_lesson?['isQuiz'] != true)
                              _buildResourceLinks(),
                          ],
                        ),
                      ),
                    ),
                    
                    // Bottom action bar
                    Container(
                      padding: EdgeInsets.only(
                        left: 16,
                        right: 16,
                        top: 16,
                        bottom: 16 + MediaQuery.of(context).padding.bottom,
                      ),
                      decoration: BoxDecoration(
                        color: _white,
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.05),
                            blurRadius: 8,
                            offset: const Offset(0, -2),
                          ),
                        ],
                      ),
                      child: Row(
                        children: [
                          // Progress indicator
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Flexible(
                                      child: Text(
                                        'Training Progress',
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          fontSize: 12,
                                          color: _textLight,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Text(
                                      '$_progressPercent% Complete',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: _progressPercent == 100 ? Colors.green : _primary,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                LinearProgressIndicator(
                                  value: _progressPercent / 100,
                                  backgroundColor: _border,
                                  valueColor: AlwaysStoppedAnimation<Color>(
                                    _progressPercent == 100 ? Colors.green : _primary
                                  ),
                                  minHeight: 4,
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '$_completedCount / $_totalCount Lessons Completed',
                                  style: const TextStyle(
                                    fontSize: 11,
                                    color: _textLight,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          
                          const SizedBox(width: 16),
                          
                          // Quiz submit or Next button
                          if (_lesson?['isQuiz'] == true && !_quizSubmitted)
                            GestureDetector(
                              onTap: () {
                                final questions = _lesson!['quizQuestions'] as List<dynamic>? ?? [];
                                if (_selectedAnswers.length == questions.length) {
                                  _submitQuiz();
                                }
                              },
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                                decoration: BoxDecoration(
                                  color: _selectedAnswers.length == (_lesson!['quizQuestions'] as List<dynamic>? ?? []).length
                                      ? _primary
                                      : _border,
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: const Text(
                                  'Submit Quiz',
                                  style: TextStyle(
                                    color: _white,
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            )
                          else if (_lesson?['isQuiz'] != true || _quizSubmitted)
                            GestureDetector(
                              onTap: _canGoNext ? _markCompleteAndNext : null,
                              child: Opacity(
                                opacity: _canGoNext ? 1.0 : 0.5,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                                  decoration: BoxDecoration(
                                    color: _primary,
                                    borderRadius: BorderRadius.circular(20),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(
                                        _currentLessonIndex < _allLessons.length - 1 ? 'Next' : 'Complete',
                                        style: const TextStyle(
                                          color: _white,
                                          fontSize: 14,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      const SizedBox(width: 4),
                                      Icon(
                                        _currentLessonIndex < _allLessons.length - 1 
                                            ? Icons.arrow_forward 
                                            : Icons.check,
                                        color: _white,
                                        size: 16,
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
                
                // Floating AI Chat button (only show if bot is configured for this lesson)
                if (_courseBot != null && 
                    _lesson != null && 
                    (_courseBot!['selectedPages'] as List<dynamic>?)?.contains(_lesson!['id']) == true)
                  Positioned(
                    right: 16,
                    bottom: 100 + MediaQuery.of(context).padding.bottom,
                    child: GestureDetector(
                      onTap: _showAIChatDialog,
                      child: Container(
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          color: _textDark,
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.25),
                              blurRadius: 16,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: const Center(
                          child: Text(
                            '🤖',
                            style: TextStyle(fontSize: 26),
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
    );
  }
}


// AI Chat Widget
class _AIChat extends StatefulWidget {
  final String lessonTitle;
  final String lessonContent;
  final String courseTitle;

  const _AIChat({
    required this.lessonTitle,
    required this.lessonContent,
    required this.courseTitle,
  });

  @override
  State<_AIChat> createState() => _AIChatState();
}

class _AIChatState extends State<_AIChat> {
  static const _bg = Color(0xFFF3F4F6);
  static const _white = Color(0xFFFFFFFF);
  static const _primary = Color(0xFFCB0002);
  static const _textDark = Color(0xFF111827);
  static const _textMedium = Color(0xFF374151);
  static const _textLight = Color(0xFF6B7280);
  static const _border = Color(0xFFD1D5DB);

  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final List<Map<String, String>> _messages = [];
  bool _isLoading = false;
  String? _userId;
  String? _currentChatId;
  List<dynamic> _chatHistory = [];
  bool _showHistory = false;

  @override
  void initState() {
    super.initState();
    _loadUserAndHistory();
  }

  Future<void> _loadUserAndHistory() async {
    final user = await AuthService.getStoredUser();
    _userId = user?['id'];
    if (_userId != null) {
      await _fetchChatHistory();
    }
  }

  Future<void> _fetchChatHistory() async {
    try {
      final response = await api.get(
        Uri.parse('https://millerstorm.tech/api/lesson-chat-history?userId=$_userId&lessonTitle=${Uri.encodeComponent(widget.lessonTitle)}'),
      );
      
      if (response.statusCode == 200) {
        final chats = jsonDecode(response.body) as List<dynamic>;
        setState(() {
          _chatHistory = chats;
        });
      }
    } catch (e) {
      print('❌ Error fetching chat history: $e');
    }
  }

  Future<void> _saveChatHistory() async {
    if (_userId == null || _messages.isEmpty) return;
    
    try {
      _currentChatId ??= 'lesson-chat-${DateTime.now().millisecondsSinceEpoch}';
      
      final title = _messages.isNotEmpty && _messages[0]['role'] == 'user'
          ? _messages[0]['content']!.substring(0, _messages[0]['content']!.length > 50 ? 50 : _messages[0]['content']!.length)
          : 'New Chat';
      
      await api.post(
        Uri.parse('https://millerstorm.tech/api/lesson-chat-history'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'userId': _userId,
          'chatId': _currentChatId,
          'lessonTitle': widget.lessonTitle,
          'title': title,
          'messages': _messages,
        }),
      );
    } catch (e) {
      print('❌ Error saving chat history: $e');
    }
  }

  void _loadChat(dynamic chat) {
    setState(() {
      _currentChatId = chat['chatId'];
      _messages.clear();
      final messages = chat['messages'] as List? ?? [];
      for (var msg in messages) {
        _messages.add({
          'role': msg['role'].toString(),
          'content': msg['content'].toString(),
        });
      }
      _showHistory = false;
    });
    _scrollToBottom();
  }

  Future<void> _deleteChat(String chatId) async {
    try {
      await api.delete(
        Uri.parse('https://millerstorm.tech/api/lesson-chat-history'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'userId': _userId,
          'chatId': chatId,
        }),
      );
      await _fetchChatHistory();
      
      if (_currentChatId == chatId) {
        setState(() {
          _messages.clear();
          _currentChatId = null;
        });
      }
    } catch (e) {
      print('❌ Error deleting chat: $e');
    }
  }

  void _startNewChat() {
    setState(() {
      _messages.clear();
      _currentChatId = null;
      _showHistory = false;
    });
  }

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    if (_scrollController.hasClients) {
      Future.delayed(const Duration(milliseconds: 100), () {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      });
    }
  }

  Future<void> _sendMessage() async {
    final message = _messageController.text.trim();
    if (message.isEmpty || _isLoading) return;

    setState(() {
      _messages.add({'role': 'user', 'content': message});
      _isLoading = true;
    });
    _messageController.clear();
    _scrollToBottom();

    try {
      final response = await api.post(
        Uri.parse('https://millerstorm.tech/api/chat'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'messages': _messages,
          'lessonTitle': widget.lessonTitle,
          'lessonContent': widget.lessonContent,
          'courseTitle': widget.courseTitle,
          'trainingText': widget.lessonContent,
          'hasTraining': true,
        }),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        setState(() {
          _messages.add({'role': 'assistant', 'content': data['message']});
        });
        
        // Save chat history after successful response
        await _saveChatHistory();
      } else {
        setState(() {
          _messages.add({
            'role': 'assistant',
            'content': 'Sorry, I couldn\'t process your request. Please try again.'
          });
        });
      }
    } catch (e) {
      print('❌ Chat error: $e');
      setState(() {
        _messages.add({
          'role': 'assistant',
          'content': 'Sorry, I couldn\'t process your request. Please try again.'
        });
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
      _scrollToBottom();
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.9,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (context, scrollController) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: Container(
          decoration: const BoxDecoration(
            color: _white,
            borderRadius: BorderRadius.only(
              topLeft: Radius.circular(20),
              topRight: Radius.circular(20),
            ),
          ),
          child: Column(
            children: [
              // Header
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFFF8FAFC),
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(20),
                    topRight: Radius.circular(20),
                  ),
                  border: const Border(
                    bottom: BorderSide(color: _border, width: 1),
                  ),
                ),
                child: Row(
                  children: [
                    if (!_showHistory)
                      IconButton(
                        icon: const Icon(Icons.history, color: _textDark),
                        onPressed: () {
                          setState(() {
                            _showHistory = true;
                          });
                        },
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                      ),
                    if (_showHistory)
                      IconButton(
                        icon: const Icon(Icons.arrow_back, color: _textDark),
                        onPressed: () {
                          setState(() {
                            _showHistory = false;
                          });
                        },
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                      ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _showHistory ? 'Chat History' : 'Lesson AI Coach',
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                              color: _textDark,
                            ),
                          ),
                          if (!_showHistory)
                            const SizedBox(height: 2),
                          if (!_showHistory)
                            Text(
                              'Ask questions about ${widget.lessonTitle}',
                              style: const TextStyle(
                                fontSize: 12,
                                color: _textLight,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                        ],
                      ),
                    ),
                    if (!_showHistory && _messages.isNotEmpty)
                      IconButton(
                        icon: const Icon(Icons.add, color: _textDark),
                        onPressed: _startNewChat,
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                      ),
                    const SizedBox(width: 8),
                    IconButton(
                      icon: const Icon(Icons.close, color: _textLight),
                      onPressed: () => Navigator.pop(context),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                    ),
                  ],
                ),
              ),

              // Messages or History
              Expanded(
                child: _showHistory
                    ? _chatHistory.isEmpty
                        ? const Center(
                            child: Padding(
                              padding: EdgeInsets.all(24),
                              child: Text(
                                'No chat history yet',
                                style: TextStyle(
                                  fontSize: 14,
                                  color: _textLight,
                                ),
                              ),
                            ),
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.all(16),
                            itemCount: _chatHistory.length,
                            itemBuilder: (context, index) {
                              final chat = _chatHistory[index];
                              return Container(
                                margin: const EdgeInsets.only(bottom: 12),
                                decoration: BoxDecoration(
                                  color: _white,
                                  border: Border.all(color: _border),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: ListTile(
                                  title: Text(
                                    chat['title'] ?? 'Chat',
                                    style: const TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w500,
                                      color: _textDark,
                                    ),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  subtitle: Text(
                                    '${(chat['messages'] as List?)?.length ?? 0} messages',
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: _textLight,
                                    ),
                                  ),
                                  trailing: IconButton(
                                    icon: const Icon(Icons.delete, color: _textLight, size: 20),
                                    onPressed: () => _deleteChat(chat['chatId']),
                                  ),
                                  onTap: () => _loadChat(chat),
                                ),
                              );
                            },
                          )
                    : _messages.isEmpty
                    ? Center(
                        child: SingleChildScrollView(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                width: 80,
                                height: 80,
                                decoration: BoxDecoration(
                                  color: _primary.withOpacity(0.1),
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(
                                  Icons.smart_toy,
                                  size: 40,
                                  color: _primary,
                                ),
                              ),
                              const SizedBox(height: 16),
                              const Text(
                                'Ask me anything!',
                                style: TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w600,
                                  color: _textDark,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'I can help answer questions about this lesson.',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 14,
                                  color: _textLight,
                                ),
                              ),
                            ],
                          ),
                        ),
                      )
                    : ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.all(16),
                        itemCount: _messages.length + (_isLoading ? 1 : 0),
                        itemBuilder: (context, index) {
                          if (index == _messages.length && _isLoading) {
                            return Container(
                              margin: const EdgeInsets.only(bottom: 12),
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: const Color(0xFFEFF6FF),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: const Text(
                                'Thinking...',
                                style: TextStyle(
                                  fontSize: 13,
                                  color: _textLight,
                                ),
                              ),
                            );
                          }

                          final message = _messages[index];
                          final isUser = message['role'] == 'user';

                          return Container(
                            margin: const EdgeInsets.only(bottom: 12),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: isUser ? _textDark : const Color(0xFFEFF6FF),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              message['content'] ?? '',
                              style: TextStyle(
                                fontSize: 13,
                                color: isUser ? _white : _textDark,
                              ),
                            ),
                          );
                        },
                      ),
              ),

              // Input area
              if (!_showHistory)
                Container(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                  decoration: const BoxDecoration(
                    color: _white,
                    border: Border(
                      top: BorderSide(color: _border, width: 1),
                    ),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        decoration: BoxDecoration(
                          color: _white,
                          border: Border.all(color: _border),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: TextField(
                          controller: _messageController,
                          maxLines: null,
                          keyboardType: TextInputType.multiline,
                          textInputAction: TextInputAction.newline,
                          decoration: const InputDecoration(
                            hintText: 'Ask the coach a question...',
                            hintStyle: TextStyle(fontSize: 13, color: _textLight),
                            border: InputBorder.none,
                            contentPadding: EdgeInsets.all(12),
                          ),
                          style: const TextStyle(fontSize: 13, color: _textDark),
                        ),
                      ),
                      const SizedBox(height: 8),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: _isLoading ? null : _sendMessage,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: _textDark,
                            disabledBackgroundColor: _border,
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                          ),
                          child: Text(
                            _isLoading ? 'Thinking...' : 'Send',
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: _white,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
