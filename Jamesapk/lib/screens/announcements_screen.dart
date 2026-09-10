import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'dart:convert';
import '../services/api_client.dart';
import '../theme/app_theme.dart';

/// Company announcements page, opened from the profile screens.
///
///  - Every role sees the full history (new + past announcements, newest
///    first) — same data as the web bell/pop-up, but never expires.
///  - Leaders ([canCompose]: branch managers & sales team leads, same form as
///    the web composer) also get a "New Announcement" section on top: title,
///    message, optional link, and a deliberate confirm step before the blast,
///    since it reaches everyone and cannot be recalled.
class AnnouncementsScreen extends StatefulWidget {
  final bool canCompose;
  const AnnouncementsScreen({super.key, this.canCompose = false});

  @override
  State<AnnouncementsScreen> createState() => _AnnouncementsScreenState();
}

class _AnnouncementsScreenState extends State<AnnouncementsScreen> {
  static const Color _primary = Color(0xFFCB0002);
  Color get _bg => AppColors.bg;
  Color get _surface => AppColors.surface;
  Color get _textDark => AppColors.textDark;
  Color get _textLight => AppColors.textLight;
  Color get _border => AppColors.border;

  final _titleController = TextEditingController();
  final _messageController = TextEditingController();
  final _linkController = TextEditingController();

  List<Map<String, dynamic>> _history = [];
  bool _loading = true;
  int? _recipients; // Audience size for the composer's confirm step.
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _loadHistory();
    if (widget.canCompose) _loadRecipients();
  }

  @override
  void dispose() {
    _titleController.dispose();
    _messageController.dispose();
    _linkController.dispose();
    super.dispose();
  }

  Future<void> _loadHistory() async {
    try {
      final res = await api.get(
        Uri.parse('https://millerstorm.tech/api/announcements?history=1'),
      );
      if (res.statusCode == 200 && mounted) {
        final list = (json.decode(res.body) as List)
            .whereType<Map<String, dynamic>>()
            .toList();
        setState(() {
          _history = list;
          _loading = false;
        });
        return;
      }
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _loadRecipients() async {
    try {
      final res = await api.get(
        Uri.parse('https://millerstorm.tech/api/announcements'),
      );
      if (res.statusCode == 200 && mounted) {
        final n = json.decode(res.body)['recipients'];
        if (n is int) setState(() => _recipients = n);
      }
    } catch (_) {}
  }

  Future<void> _send() async {
    final title = _titleController.text.trim();
    final message = _messageController.text.trim();
    if (title.isEmpty || message.isEmpty || _sending) return;

    // Same deliberate confirm as the web composer — this cannot be recalled.
    final who = _recipients != null ? '$_recipients people' : 'everyone';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: _surface,
        title: Text('Send announcement?', style: TextStyle(color: _textDark, fontWeight: FontWeight.w800)),
        content: Text(
          "This announcement will be sent to $who and pushed to their phones. It can't be recalled. Send it now?",
          style: TextStyle(color: _textLight, fontSize: 14.5),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancel', style: TextStyle(color: _textLight)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: _primary, foregroundColor: Colors.white),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Yes, send'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    setState(() => _sending = true);
    try {
      final res = await api.post(
        Uri.parse('https://millerstorm.tech/api/announcements'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'title': title,
          'message': message,
          'link': _linkController.text.trim(),
        }),
      );
      if (!mounted) return;
      if (res.statusCode == 200) {
        final data = json.decode(res.body);
        _titleController.clear();
        _messageController.clear();
        _linkController.clear();
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('✅ Sent to ${data['recipients']} people'),
          backgroundColor: Colors.green[700],
        ));
        _loadHistory();
      } else {
        final err = (json.decode(res.body)['error'] ?? 'Failed to send announcement.').toString();
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('❌ $err'),
          backgroundColor: Colors.red[700],
        ));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: const Text('❌ Failed to send announcement.'),
          backgroundColor: Colors.red[700],
        ));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: themeController,
      builder: (context, _) => Scaffold(
        backgroundColor: _bg,
        appBar: AppBar(
          backgroundColor: _primary,
          elevation: 0,
          iconTheme: const IconThemeData(color: Colors.white),
          title: const Text(
            'Announcements',
            style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
          ),
        ),
        body: RefreshIndicator(
          color: _primary,
          onRefresh: () async {
            await _loadHistory();
            if (widget.canCompose) await _loadRecipients();
          },
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (widget.canCompose) ...[
                _composeCard(),
                const SizedBox(height: 24),
              ],
              _sectionLabel('ALL ANNOUNCEMENTS'),
              const SizedBox(height: 10),
              if (_loading)
                const Padding(
                  padding: EdgeInsets.all(40),
                  child: Center(child: CircularProgressIndicator(color: _primary)),
                )
              else if (_history.isEmpty)
                Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    children: [
                      Icon(Icons.campaign_outlined, size: 56, color: _textLight.withOpacity(0.4)),
                      const SizedBox(height: 12),
                      Text('No announcements yet',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: _textDark)),
                    ],
                  ),
                )
              else
                ..._history.map(_announcementCard),
            ],
          ),
        ),
      ),
    );
  }

  Widget _sectionLabel(String text) => Text(
        text,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.6,
          color: _textLight,
        ),
      );

  // ---- Composer (leaders only) — mirrors the web AnnouncementComposer ------

  Widget _composeCard() {
    final canSend = _titleController.text.trim().isNotEmpty &&
        _messageController.text.trim().isNotEmpty &&
        !_sending;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('📢 New Announcement',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: _textDark)),
          const SizedBox(height: 4),
          Text(
            'Sent to everyone in Miller Storm — in-app pop-up, the notification bell, and a phone push.',
            style: TextStyle(fontSize: 12.5, color: _textLight),
          ),
          const SizedBox(height: 16),
          _fieldLabel('TITLE *'),
          _input(_titleController, 'e.g. AccuLynx Two-Factor Authentication', maxLength: 120),
          const SizedBox(height: 12),
          _fieldLabel('MESSAGE *'),
          _input(_messageController, 'A short, important message for the whole company.', lines: 4),
          const SizedBox(height: 12),
          _fieldLabel('LINK (OPTIONAL)'),
          _input(_linkController, 'https://…  (the "know more" destination)'),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: canSend ? _send : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: _primary,
                foregroundColor: Colors.white,
                disabledBackgroundColor: _primary.withOpacity(0.4),
                disabledForegroundColor: Colors.white70,
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              child: Text(
                _sending
                    ? 'Sending…'
                    : _recipients != null
                        ? 'Send to $_recipients people'
                        : 'Send to everyone',
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _fieldLabel(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text,
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.4, color: _textLight)),
      );

  Widget _input(TextEditingController c, String hint, {int lines = 1, int? maxLength}) {
    return TextField(
      controller: c,
      maxLines: lines,
      maxLength: maxLength,
      onChanged: (_) => setState(() {}),
      style: TextStyle(color: _textDark, fontSize: 14.5),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: AppColors.textPlaceholder, fontSize: 13.5),
        counterText: '',
        filled: true,
        fillColor: _bg,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
      ),
    );
  }

  // ---- History list --------------------------------------------------------

  Widget _announcementCard(Map<String, dynamic> a) {
    final title = (a['title'] ?? '').toString();
    final message = (a['message'] ?? '').toString();
    final link = (a['link'] ?? '').toString();
    final by = (a['postedByName'] ?? '').toString();
    String when = '';
    final raw = (a['createdAt'] ?? '').toString();
    final dt = DateTime.tryParse(raw)?.toLocal();
    if (dt != null) {
      when = '${dt.day}/${dt.month}/${dt.year}';
    }
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 36,
                height: 36,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: _primary.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.campaign, color: _primary, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(title,
                    style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: _textDark)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(message, style: TextStyle(fontSize: 14, height: 1.45, color: _textDark.withOpacity(0.85))),
          if (link.isNotEmpty) ...[
            const SizedBox(height: 10),
            GestureDetector(
              onTap: () {
                final uri = Uri.tryParse(link);
                if (uri != null) launchUrl(uri, mode: LaunchMode.externalApplication);
              },
              child: const Text('Learn more →',
                  style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: _primary)),
            ),
          ],
          const SizedBox(height: 10),
          Text(
            [if (by.isNotEmpty) by, if (when.isNotEmpty) when].join(' · '),
            style: TextStyle(fontSize: 12, color: _textLight),
          ),
        ],
      ),
    );
  }
}
