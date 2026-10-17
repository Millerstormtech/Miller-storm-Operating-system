import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';

import '../services/api_client.dart';
import '../services/storm_chat_logic.dart';
import 'storm_chat_room_screen.dart';

// Message search (GroupMe-style, PR #105): GET /api/storm-chat/search.
// With [groupId] it searches that one chat and pops with the chosen message's
// id (the chat jumps to it); without, it searches every chat the person is in
// and opens the chosen chat at that message. The server leaves out deleted
// messages and grey notices, and needs at least 2 characters.
class StormChatSearchScreen extends StatefulWidget {
  final String? groupId;
  final String? chatName;
  final String userId;
  final String userRole;

  const StormChatSearchScreen({super.key, this.groupId, this.chatName, required this.userId, required this.userRole});

  @override
  State<StormChatSearchScreen> createState() => _StormChatSearchScreenState();
}

class _StormChatSearchScreenState extends State<StormChatSearchScreen> {
  static const _primary = Color(0xFFCB0002);
  final _box = TextEditingController();
  Timer? _debounce;
  List<Map<String, dynamic>> _results = [];
  String _term = '';
  String? _error;
  bool _loading = false;
  int _asked = 0; // only the latest search's answer is shown

  @override
  void dispose() {
    _debounce?.cancel();
    _box.dispose();
    super.dispose();
  }

  void _onChanged(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () => _search(v));
  }

  Future<void> _search(String raw) async {
    final term = raw.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (term.length < 2) {
      setState(() {
        _term = term;
        _results = [];
        _error = null;
        _loading = false;
      });
      return;
    }
    final ask = ++_asked;
    setState(() {
      _term = term;
      _loading = true;
      _error = null;
    });
    try {
      final q = {'q': term, if (widget.groupId != null) 'groupId': widget.groupId!};
      final res = await api.get(Uri.parse('https://millerstorm.tech/api/storm-chat/search').replace(queryParameters: q));
      if (!mounted || ask != _asked) return;
      if (res.statusCode == 200) {
        setState(() {
          _results = (json.decode(res.body) as List).whereType<Map>().map((m) => Map<String, dynamic>.from(m)).toList();
          _loading = false;
        });
      } else {
        String msg = "Search didn't work. Try again.";
        try {
          final d = json.decode(res.body);
          if (d is Map && d['error'] is String) msg = d['error'];
        } catch (_) {}
        setState(() {
          _error = msg;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted && ask == _asked) {
        setState(() {
          _error = "Search didn't work. Check your connection.";
          _loading = false;
        });
      }
    }
  }

  void _open(Map<String, dynamic> r) {
    if (widget.groupId != null) {
      Navigator.pop(context, '${r['_id']}');
      return;
    }
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => StormChatRoomScreen(
          group: {'_id': r['groupId'], 'name': r['chatName'] ?? 'Chat', if (r['isDirect'] == true) 'isDirect': true},
          userId: widget.userId,
          userRole: widget.userRole,
          initialMessageId: '${r['_id']}',
        ),
      ),
    );
  }

  // The snippet with the searched words in bold.
  TextSpan _highlight(String text, Color color) {
    final spans = <TextSpan>[];
    final lower = text.toLowerCase();
    final term = _term.toLowerCase();
    var i = 0;
    while (term.isNotEmpty) {
      final at = lower.indexOf(term, i);
      if (at < 0) break;
      if (at > i) spans.add(TextSpan(text: text.substring(i, at)));
      spans.add(TextSpan(text: text.substring(at, at + term.length), style: const TextStyle(fontWeight: FontWeight.w700)));
      i = at + term.length;
    }
    if (i < text.length) spans.add(TextSpan(text: text.substring(i)));
    return TextSpan(style: TextStyle(fontSize: 14, color: color), children: spans);
  }

  String _when(String iso) {
    final t = DateTime.tryParse(iso);
    if (t == null) return '';
    final c = centralTime(t);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final today = centralTime(DateTime.now());
    if (c.year == today.year && c.month == today.month && c.day == today.day) return centralWhenLabel(iso);
    return '${months[c.month - 1]} ${c.day}';
  }

  @override
  Widget build(BuildContext context) {
    final oneChat = widget.groupId != null;
    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F5),
      appBar: AppBar(
        backgroundColor: _primary,
        iconTheme: const IconThemeData(color: Colors.white),
        title: TextField(
          controller: _box,
          autofocus: true,
          onChanged: _onChanged,
          onSubmitted: _search,
          textInputAction: TextInputAction.search,
          style: const TextStyle(color: Colors.white),
          cursorColor: Colors.white,
          decoration: InputDecoration(
            hintText: oneChat ? 'Search ${widget.chatName ?? 'this chat'}' : 'Search messages',
            hintStyle: const TextStyle(color: Colors.white70),
            border: InputBorder.none,
          ),
        ),
      ),
      body: Builder(builder: (context) {
        if (_loading && _results.isEmpty) {
          return const Center(child: CircularProgressIndicator(color: _primary));
        }
        if (_error != null) {
          return Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!, textAlign: TextAlign.center)));
        }
        if (_term.length < 2) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                oneChat ? 'Type at least 2 characters to search this chat.' : 'Type at least 2 characters to search every chat you’re in.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Color(0xFF6B7280)),
              ),
            ),
          );
        }
        if (_results.isEmpty) {
          return const Center(child: Text('No messages found', style: TextStyle(color: Color(0xFF6B7280))));
        }
        return ListView.separated(
          itemCount: _results.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (_, i) {
            final r = _results[i];
            final sender = '${r['senderName'] ?? ''}';
            return ListTile(
              tileColor: Colors.white,
              title: Text(oneChat ? sender : '${r['chatName'] ?? 'Chat'}',
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
              subtitle: Text.rich(
                TextSpan(children: [
                  if (!oneChat && r['isDirect'] != true && sender.isNotEmpty) TextSpan(text: '$sender: '),
                  _highlight('${r['snippet'] ?? ''}', const Color(0xFF374151)),
                ]),
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
              ),
              trailing: Text(_when('${r['createdAt']}'), style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
              onTap: () => _open(r),
            );
          },
        );
      }),
    );
  }
}
