import 'package:flutter/material.dart';
import 'dart:convert';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import 'ai_clone_chat_screen.dart';

/// Jay's AI Clone — lists the available AI assistants (bots) and opens a chat
/// with the one tapped. Same data as the web "Jay's AI Clone" (/api/ai-bots).
class JaysAiCloneScreen extends StatefulWidget {
  const JaysAiCloneScreen({super.key});

  @override
  State<JaysAiCloneScreen> createState() => _JaysAiCloneScreenState();
}

class _JaysAiCloneScreenState extends State<JaysAiCloneScreen> {
  static const _bg = Color(0xFFF3F4F6);
  static const _white = Color(0xFFFFFFFF);
  static const _primary = Color(0xFFCB0002);
  static const _textDark = Color(0xFF111827);
  static const _textLight = Color(0xFF6B7280);

  List<dynamic> _bots = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _fetchBots();
  }

  Future<void> _fetchBots() async {
    setState(() => _loading = true);
    try {
      final user = await AuthService.getStoredUser();
      final role = user?['role']?.toString();
      final response = await api.get(Uri.parse('https://millerstorm.tech/api/ai-bots?light=1'));
      if (response.statusCode == 200) {
        final data = json.decode(response.body) as List;
        // Only show bots assigned to this user's panel (same as the web
        // BotChatWidget: assignedRoles must include the logged-in role).
        final filtered = data.where((b) {
          final ar = b['assignedRoles'];
          return ar is List && role != null && ar.contains(role);
        }).toList();
        if (!mounted) return;
        setState(() {
          _bots = filtered;
          _loading = false;
        });
      } else {
        if (mounted) setState(() => _loading = false);
      }
    } catch (e) {
      print('Error fetching bots: $e');
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _white,
        elevation: 0,
        foregroundColor: _textDark,
        title: const Text("Jay's AI Clone",
            style: TextStyle(color: _textDark, fontSize: 18, fontWeight: FontWeight.w700)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _primary))
          : _bots.isEmpty
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.smart_toy_outlined, size: 48, color: _textLight.withOpacity(0.5)),
                      const SizedBox(height: 12),
                      const Text('No AI assistants available', style: TextStyle(fontSize: 14, color: _textLight)),
                    ],
                  ),
                )
              : RefreshIndicator(
                  color: _primary,
                  onRefresh: _fetchBots,
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: _bots.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (context, i) => _botCard(_bots[i]),
                  ),
                ),
    );
  }

  Widget _botCard(dynamic bot) {
    final name = (bot['name'] ?? 'Unknown Bot').toString();
    final description = (bot['description'] ?? '').toString();
    // Admin-set avatar (botAvatarUrl) is a full image URL; fall back to legacy
    // imageUrl and prepend the site origin for relative paths.
    final rawAvatar = (bot['botAvatarUrl'] ?? bot['imageUrl'] ?? '').toString();
    final imageUrl = rawAvatar.isEmpty
        ? ''
        : (rawAvatar.startsWith('http') ? rawAvatar : 'https://millerstorm.tech$rawAvatar');

    return GestureDetector(
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => AiCloneChatScreen(bot: bot)),
      ),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: _white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8)],
        ),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: const Color(0xFFFEF2F2),
                borderRadius: BorderRadius.circular(12),
                image: imageUrl.isNotEmpty
                    ? DecorationImage(image: NetworkImage(imageUrl), fit: BoxFit.cover)
                    : null,
              ),
              child: imageUrl.isEmpty ? const Icon(Icons.smart_toy, size: 24, color: _primary) : null,
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name,
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: _textDark)),
                  if (description.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(description,
                        style: const TextStyle(fontSize: 13, color: _textLight),
                        maxLines: 2, overflow: TextOverflow.ellipsis),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(color: const Color(0xFFF3F4F6), borderRadius: BorderRadius.circular(8)),
              child: const Icon(Icons.arrow_forward_ios, color: _textLight, size: 14),
            ),
          ],
        ),
      ),
    );
  }
}
