import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'dart:io';
import 'package:http/http.dart' as http;
import '../services/api_client.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:video_player/video_player.dart';
import 'package:gal/gal.dart';

class VideoViewerScreen extends StatefulWidget {
  final String videoUrl;
  final String? fileName;

  const VideoViewerScreen({
    Key? key,
    required this.videoUrl,
    this.fileName,
  }) : super(key: key);

  @override
  State<VideoViewerScreen> createState() => _VideoViewerScreenState();
}

class _VideoViewerScreenState extends State<VideoViewerScreen> {
  late VideoPlayerController _controller;
  bool _isInitialized = false;
  bool _hasError = false;
  bool _showControls = true;

  @override
  void initState() {
    super.initState();
    _initializeVideo();
  }

  void _initializeVideo() async {
    try {
      final url = widget.videoUrl.startsWith('http') 
          ? widget.videoUrl 
          : 'https://millerstorm.tech${widget.videoUrl}';
      
      print('🎥 Initializing video from URL: $url');
      
      _controller = VideoPlayerController.networkUrl(Uri.parse(url));
      
      await _controller.initialize();
      
      print('✅ Video initialized successfully');
      print('📊 Video duration: ${_controller.value.duration}');
      print('📐 Video aspect ratio: ${_controller.value.aspectRatio}');
      
      setState(() {
        _isInitialized = true;
      });
      
      _controller.play();
      
      // Auto-hide controls after 3 seconds
      Future.delayed(const Duration(seconds: 3), () {
        if (mounted) {
          setState(() {
            _showControls = false;
          });
        }
      });
    } catch (e) {
      print('❌ Video initialization error: $e');
      print('❌ Video URL was: ${widget.videoUrl}');
      setState(() {
        _hasError = true;
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _togglePlayPause() {
    setState(() {
      if (_controller.value.isPlaying) {
        _controller.pause();
      } else {
        _controller.play();
      }
    });
  }

  void _toggleControls() {
    setState(() {
      _showControls = !_showControls;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          widget.fileName ?? 'Video',
          style: const TextStyle(color: Colors.white, fontSize: 16),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.download, color: Colors.white),
            onPressed: () => _downloadVideo(context),
          ),
          IconButton(
            icon: const Icon(Icons.share, color: Colors.white),
            onPressed: () => _shareVideo(context),
          ),
          IconButton(
            icon: const Icon(Icons.more_vert, color: Colors.white),
            onPressed: () => _showMoreOptions(context),
          ),
        ],
      ),
      body: Center(
        child: _hasError
            ? const Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.error, color: Colors.white, size: 64),
                  SizedBox(height: 16),
                  Text(
                    'Failed to load video',
                    style: TextStyle(color: Colors.white),
                  ),
                ],
              )
            : !_isInitialized
                ? const CircularProgressIndicator(color: Colors.white)
                : GestureDetector(
                    onTap: _toggleControls,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        AspectRatio(
                          aspectRatio: _controller.value.aspectRatio,
                          child: VideoPlayer(_controller),
                        ),
                        if (_showControls)
                          Container(
                            color: Colors.black.withOpacity(0.3),
                            child: Center(
                              child: IconButton(
                                icon: Icon(
                                  _controller.value.isPlaying
                                      ? Icons.pause_circle_filled
                                      : Icons.play_circle_filled,
                                  color: Colors.white,
                                  size: 64,
                                ),
                                onPressed: _togglePlayPause,
                              ),
                            ),
                          ),
                        if (_showControls)
                          Positioned(
                            bottom: 0,
                            left: 0,
                            right: 0,
                            child: Container(
                              color: Colors.black.withOpacity(0.5),
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                              child: Row(
                                children: [
                                  Text(
                                    _formatDuration(_controller.value.position),
                                    style: const TextStyle(color: Colors.white, fontSize: 12),
                                  ),
                                  Expanded(
                                    child: Slider(
                                      value: _controller.value.position.inSeconds.toDouble(),
                                      max: _controller.value.duration.inSeconds.toDouble(),
                                      activeColor: const Color(0xFFCB0002),
                                      inactiveColor: Colors.white30,
                                      onChanged: (value) {
                                        _controller.seekTo(Duration(seconds: value.toInt()));
                                      },
                                    ),
                                  ),
                                  Text(
                                    _formatDuration(_controller.value.duration),
                                    style: const TextStyle(color: Colors.white, fontSize: 12),
                                  ),
                                ],
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
      ),
    );
  }

  String _formatDuration(Duration duration) {
    String twoDigits(int n) => n.toString().padLeft(2, '0');
    final minutes = twoDigits(duration.inMinutes.remainder(60));
    final seconds = twoDigits(duration.inSeconds.remainder(60));
    return '$minutes:$seconds';
  }

  void _downloadVideo(BuildContext context) async {
    try {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Downloading video...'),
          backgroundColor: Colors.green,
        ),
      );

      final url = widget.videoUrl.startsWith('http') 
          ? widget.videoUrl 
          : 'https://millerstorm.tech${widget.videoUrl}';
      final response = await api.get(Uri.parse(url));
      
      // Save to temp file first
      final tempDir = await getTemporaryDirectory();
      final file = File('${tempDir.path}/StormChat_${DateTime.now().millisecondsSinceEpoch}.mp4');
      await file.writeAsBytes(response.bodyBytes);
      
      await Gal.putVideo(file.path);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Video saved to Gallery'),
          backgroundColor: Colors.green,
          duration: Duration(seconds: 3),
        ),
      );
    } catch (e) {
      print('Download error: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to download: ${e.toString()}'),
          backgroundColor: Colors.red,
          duration: const Duration(seconds: 3),
        ),
      );
    }
  }

  void _shareVideo(BuildContext context) async {
    try {
      final url = widget.videoUrl.startsWith('http') 
          ? widget.videoUrl 
          : 'https://millerstorm.tech${widget.videoUrl}';
      
      // Download video temporarily for sharing
      final response = await api.get(Uri.parse(url));
      if (response.statusCode == 200) {
        final tempDir = await getTemporaryDirectory();
        final fileName = 'share_video_${DateTime.now().millisecondsSinceEpoch}.mp4';
        final file = File('${tempDir.path}/$fileName');
        await file.writeAsBytes(response.bodyBytes);
        
        await Share.shareXFiles(
          [XFile(file.path)],
          text: 'Shared from StormChat',
        );
      }
    } catch (e) {
      print('Share error: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to share video'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  void _showMoreOptions(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.grey[900],
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.download, color: Colors.white),
              title: const Text('Download', style: TextStyle(color: Colors.white)),
              onTap: () {
                Navigator.pop(context);
                _downloadVideo(context);
              },
            ),
            ListTile(
              leading: const Icon(Icons.info, color: Colors.white),
              title: const Text('Video Info', style: TextStyle(color: Colors.white)),
              onTap: () {
                Navigator.pop(context);
                _showVideoInfo(context);
              },
            ),
          ],
        ),
      ),
    );
  }

  void _showVideoInfo(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: Colors.grey[900],
        title: const Text('Video Info', style: TextStyle(color: Colors.white)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('URL: ${widget.videoUrl}', style: const TextStyle(color: Colors.white70)),
            if (widget.fileName != null)
              Text('Name: ${widget.fileName}', style: const TextStyle(color: Colors.white70)),
            if (_isInitialized)
              Text('Duration: ${_formatDuration(_controller.value.duration)}', 
                style: const TextStyle(color: Colors.white70)),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close', style: TextStyle(color: Colors.blue)),
          ),
        ],
      ),
    );
  }
}
