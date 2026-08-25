import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:video_player/video_player.dart';
import '../theme/app_theme.dart';
import '../services/api_client.dart';

/// One support ticket, opened from the Support screen. Shows the current status
/// (which everyone involved can follow), the original request, and a back-and-
/// forth conversation between the person who raised it and the support/handler.
/// Polls for new replies so both sides can talk in near real-time.
class TicketDetailScreen extends StatefulWidget {
  final Map<String, dynamic> ticket;
  const TicketDetailScreen({super.key, required this.ticket});

  @override
  State<TicketDetailScreen> createState() => _TicketDetailScreenState();
}

class _TicketDetailScreenState extends State<TicketDetailScreen> {
  Color get _bg => AppColors.bg;
  Color get _surface => AppColors.surface;
  static const _primary = Color(0xFFCB0002);

  static const _statusLabel = {
    'open': 'Open',
    'approved': 'Approved',
    'in_progress': 'In Progress',
    'completed': 'Completed',
    'rejected': 'Rejected',
  };
  // The normal forward flow shown as a stepper (rejected is a terminal offshoot).
  static const _flow = ['open', 'approved', 'in_progress', 'completed'];

  Map<String, dynamic> _ticket = {};
  String _myId = '';
  bool _sending = false;
  bool _uploading = false;
  final _replyCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _ticket = Map<String, dynamic>.from(widget.ticket);
    _loadMe();
    _fetch();
    // Light polling so a reply from the other side shows up without a manual refresh.
    _poll = Timer.periodic(const Duration(seconds: 8), (_) => _fetch());
  }

  @override
  void dispose() {
    _poll?.cancel();
    _replyCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadMe() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userStr = prefs.getString('user');
      if (userStr != null) {
        final user = jsonDecode(userStr);
        // Match the server's senderId (the JWT `sub`, i.e. the app `id`).
        setState(() => _myId = (user['id'] ?? user['_id'] ?? '').toString());
      }
    } catch (_) {}
  }

  Future<void> _fetch() async {
    try {
      final id = (_ticket['id'] ?? '').toString();
      if (id.isEmpty) return;
      final res = await api.get(Uri.parse('https://millerstorm.tech/api/tickets/$id'));
      if (res.statusCode == 200 && mounted) {
        final wasCount = (_ticket['messages'] as List?)?.length ?? 0;
        setState(() => _ticket = Map<String, dynamic>.from(jsonDecode(res.body)));
        final nowCount = (_ticket['messages'] as List?)?.length ?? 0;
        if (nowCount != wasCount) _scrollToBottom();
      }
    } catch (_) {}
  }

  // Post a message (text and/or a photo/video attachment) to the ticket.
  Future<bool> _postMessage(Map<String, dynamic> payload) async {
    final id = (_ticket['id'] ?? '').toString();
    final res = await api.post(
      Uri.parse('https://millerstorm.tech/api/tickets/$id'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(payload),
    );
    if (res.statusCode == 200 && mounted) {
      setState(() => _ticket = Map<String, dynamic>.from(jsonDecode(res.body)));
      _scrollToBottom();
      return true;
    } else if (res.statusCode == 409) {
      // Someone replied first — resync so the turn state is correct.
      _toast('Support just replied — please read the latest message.');
      _fetch();
    } else {
      _toast('Could not send. Try again.');
    }
    return false;
  }

  Future<void> _send() async {
    final text = _replyCtrl.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      if (await _postMessage({'text': text})) _replyCtrl.clear();
    } catch (_) {
      _toast('Network error. Try again.');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  // Pick a photo/video, upload it to /api/upload-image, then post it as a message.
  Future<void> _pickAndSend(bool video) async {
    if (_uploading || _sending) return;
    final picker = ImagePicker();
    final XFile? f = video
        ? await picker.pickVideo(source: ImageSource.gallery)
        : await picker.pickImage(source: ImageSource.gallery, imageQuality: 60);
    if (f == null) return;
    setState(() => _uploading = true);
    try {
      final req = http.MultipartRequest(
        'POST',
        Uri.parse('https://millerstorm.tech/api/upload-image'),
      );
      req.headers['Accept'] = 'application/json';
      req.files.add(await http.MultipartFile.fromPath('file', f.path));
      final streamed = await api.send(req).timeout(const Duration(minutes: 10));
      final resp = await http.Response.fromStream(streamed);
      if (resp.statusCode == 200) {
        final url = (jsonDecode(resp.body)['url'] ?? '').toString();
        if (url.isNotEmpty) {
          await _postMessage({'mediaUrl': url, 'mediaType': video ? 'video' : 'image'});
        }
      } else {
        _toast('Upload failed. Try again.');
      }
    } catch (_) {
      _toast('Upload failed. Try again.');
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  String _fullUrl(String url) =>
      url.isEmpty || url.startsWith('http') ? url : 'https://millerstorm.tech$url';

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(_scrollCtrl.position.maxScrollExtent,
            duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      }
    });
  }

  void _toast(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  // Turn-based conversation: you can only reply when the LAST message was from the
  // other side. After you send, it's their turn — your box hides until they answer.
  // With no replies yet the original request counts as the raiser's turn, so the
  // raiser waits for support to ask the first question.
  bool get _myTurn {
    final msgs = (_ticket['messages'] as List?) ?? const [];
    if (msgs.isEmpty) return false; // waiting for support to start the chat
    final last = msgs.last as Map;
    final senderId = (last['senderId'] ?? '').toString();
    final raiserId = (_ticket['userId'] ?? '').toString();
    final lastFromStaff =
        last['fromStaff'] == true || (senderId.isNotEmpty && senderId != raiserId);
    // The raiser (mobile viewer) replies only when support spoke last.
    return lastFromStaff;
  }

  @override
  Widget build(BuildContext context) {
    final status = (_ticket['status'] ?? 'open').toString();
    final messages = (_ticket['messages'] as List?) ?? const [];
    final note = (_ticket['note'] ?? '').toString();
    final raiserId = (_ticket['userId'] ?? '').toString();

    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _primary,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text('Ticket', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: Column(
        children: [
          // Status + original request header.
          Container(
            width: double.infinity,
            color: _surface,
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _statusBadge(status),
                const SizedBox(height: 14),
                _statusStepper(status),
                if (note.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  Text('Your request',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.textLight)),
                  const SizedBox(height: 4),
                  Text(note, style: TextStyle(fontSize: 14, color: AppColors.textDark)),
                ],
              ],
            ),
          ),
          Container(height: 1, color: AppColors.border),
          // Conversation.
          Expanded(
            child: messages.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        'No replies yet.\nSend a message to talk with the support team.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: AppColors.textPlaceholder, fontSize: 14, height: 1.4),
                      ),
                    ),
                  )
                : ListView.builder(
                    controller: _scrollCtrl,
                    padding: const EdgeInsets.all(14),
                    itemCount: messages.length,
                    itemBuilder: (context, i) {
                      final m = messages[i] as Map;
                      final senderId = (m['senderId'] ?? '').toString();
                      final fromStaff = m['fromStaff'] == true ||
                          (senderId.isNotEmpty && senderId != raiserId);
                      // "Mine" = I sent it. On mobile the viewer is always the
                      // raiser, so if the id can't be matched fall back to the
                      // staff flag (raiser's own messages sit on the right).
                      final mine = _myId.isNotEmpty ? senderId == _myId : !fromStaff;
                      return _bubble(
                        mine: mine,
                        name: (m['senderName'] ?? '').toString(),
                        text: (m['text'] ?? '').toString(),
                        fromStaff: fromStaff,
                        mediaUrl: (m['mediaUrl'] ?? '').toString(),
                        mediaType: (m['mediaType'] ?? '').toString(),
                      );
                    },
                  ),
          ),
          // Reply box — only when it's the raiser's turn to answer. After sending,
          // it hides until support replies again.
          _myTurn ? _replyBar() : _waitingBar(status),
        ],
      ),
    );
  }

  Widget _waitingBar(String status) {
    final msgs = (_ticket['messages'] as List?) ?? const [];
    final text = msgs.isEmpty
        ? 'Support will reach out here if they need anything.'
        : 'Waiting for support to reply…';
    return SafeArea(
      top: false,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: _surface,
          border: Border(top: BorderSide(color: AppColors.border)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.hourglass_empty, size: 16, color: AppColors.textPlaceholder),
            const SizedBox(width: 8),
            Flexible(
              child: Text(text,
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: AppColors.textLight)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _statusBadge(String status) {
    final label = _statusLabel[status] ?? status;
    final bg = status == 'completed' || status == 'approved'
        ? const Color(0xFF16A34A)
        : status == 'rejected'
            ? const Color(0xFFDC2626)
            : status == 'in_progress'
                ? const Color(0xFFF59E0B)
                : _primary;
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
          decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
          child: Text(label,
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
        ),
      ],
    );
  }

  // Simple horizontal stepper for the forward flow. Rejected shows just the badge.
  Widget _statusStepper(String status) {
    if (status == 'rejected') return const SizedBox.shrink();
    final current = _flow.indexOf(status).clamp(0, _flow.length - 1);
    return Row(
      children: [
        for (int i = 0; i < _flow.length; i++) ...[
          Column(
            children: [
              Container(
                width: 20,
                height: 20,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: i <= current ? _primary : AppColors.surfaceAlt,
                  border: Border.all(color: i <= current ? _primary : AppColors.border, width: 2),
                ),
                child: i <= current
                    ? const Icon(Icons.check, size: 12, color: Colors.white)
                    : null,
              ),
              const SizedBox(height: 4),
              Text(_statusLabel[_flow[i]] ?? '',
                  style: TextStyle(
                      fontSize: 9,
                      fontWeight: i == current ? FontWeight.w700 : FontWeight.w500,
                      color: i <= current ? AppColors.textDark : AppColors.textPlaceholder)),
            ],
          ),
          if (i < _flow.length - 1)
            Expanded(
              child: Container(
                height: 2,
                margin: const EdgeInsets.only(bottom: 16),
                color: i < current ? _primary : AppColors.border,
              ),
            ),
        ],
      ],
    );
  }

  Widget _bubble({
    required bool mine,
    required String name,
    required String text,
    required bool fromStaff,
    String mediaUrl = '',
    String mediaType = '',
  }) {
    final url = _fullUrl(mediaUrl);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        mainAxisAlignment: mine ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          Flexible(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
              decoration: BoxDecoration(
                color: mine ? _primary : _surface,
                borderRadius: BorderRadius.circular(14),
                border: mine ? null : Border.all(color: AppColors.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    fromStaff ? '$name · Support' : name,
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: mine ? Colors.white70 : AppColors.textLight),
                  ),
                  if (url.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    _media(url, mediaType, mine),
                  ],
                  if (text.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(text,
                        style: TextStyle(
                            fontSize: 14, color: mine ? Colors.white : AppColors.textDark)),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _media(String url, String type, bool mine) {
    if (type == 'video') {
      return GestureDetector(
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => _TicketVideoScreen(url: url)),
        ),
        child: Container(
          width: 220,
          height: 130,
          decoration: BoxDecoration(
            color: Colors.black87,
            borderRadius: BorderRadius.circular(10),
          ),
          alignment: Alignment.center,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: const [
              Icon(Icons.play_circle_fill, color: Colors.white, size: 44),
              SizedBox(height: 6),
              Text('Tap to play video', style: TextStyle(color: Colors.white70, fontSize: 12)),
            ],
          ),
        ),
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: Image.network(
        url,
        width: 220,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => Container(
          width: 220, height: 130, color: Colors.black12,
          alignment: Alignment.center,
          child: const Icon(Icons.broken_image, color: Colors.grey),
        ),
      ),
    );
  }

  Widget _replyBar() {
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
        decoration: BoxDecoration(
          color: _surface,
          border: Border(top: BorderSide(color: AppColors.border)),
        ),
        child: Row(
          children: [
            // Attach photo / video (or a spinner while uploading).
            if (_uploading)
              const Padding(
                padding: EdgeInsets.all(10),
                child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)),
              )
            else ...[
              IconButton(
                icon: Icon(Icons.photo_outlined, color: _primary),
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
                tooltip: 'Photo',
                onPressed: _sending ? null : () => _pickAndSend(false),
              ),
              IconButton(
                icon: Icon(Icons.videocam_outlined, color: _primary),
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
                tooltip: 'Video',
                onPressed: _sending ? null : () => _pickAndSend(true),
              ),
            ],
            const SizedBox(width: 4),
            Expanded(
              child: TextField(
                controller: _replyCtrl,
                minLines: 1,
                maxLines: 4,
                textCapitalization: TextCapitalization.sentences,
                style: TextStyle(color: AppColors.textDark),
                decoration: InputDecoration(
                  hintText: 'Write a message…',
                  hintStyle: TextStyle(color: AppColors.textPlaceholder),
                  filled: true,
                  fillColor: AppColors.surfaceAlt,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(22),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 6),
            Material(
              color: _primary,
              shape: const CircleBorder(),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: _sending ? null : _send,
                child: Padding(
                  padding: const EdgeInsets.all(11),
                  child: _sending
                      ? const SizedBox(
                          width: 20, height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.send_rounded, color: Colors.white, size: 20),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Simple full-screen player for a ticket's video attachment.
class _TicketVideoScreen extends StatefulWidget {
  final String url;
  const _TicketVideoScreen({required this.url});

  @override
  State<_TicketVideoScreen> createState() => _TicketVideoScreenState();
}

class _TicketVideoScreenState extends State<_TicketVideoScreen> {
  VideoPlayerController? _c;

  @override
  void initState() {
    super.initState();
    _c = VideoPlayerController.networkUrl(Uri.parse(widget.url))
      ..initialize().then((_) {
        if (!mounted) return;
        setState(() {});
        _c?.play();
      });
  }

  @override
  void dispose() {
    _c?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = _c;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        iconTheme: const IconThemeData(color: Colors.white),
        elevation: 0,
      ),
      body: Center(
        child: (c != null && c.value.isInitialized)
            ? AspectRatio(aspectRatio: c.value.aspectRatio, child: VideoPlayer(c))
            : const CircularProgressIndicator(color: Colors.white),
      ),
      floatingActionButton: (c != null && c.value.isInitialized)
          ? FloatingActionButton(
              backgroundColor: const Color(0xFFCB0002),
              onPressed: () => setState(() => c.value.isPlaying ? c.pause() : c.play()),
              child: Icon(c.value.isPlaying ? Icons.pause : Icons.play_arrow, color: Colors.white),
            )
          : null,
    );
  }
}
