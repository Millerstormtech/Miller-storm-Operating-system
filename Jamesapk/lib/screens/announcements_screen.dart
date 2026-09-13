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

  // "Who will see this" — mirrors the web AnnouncementComposer exactly. The
  // options themselves (which types, which branches, which teams) come from
  // GET /api/announcements?options=1, already scoped to this rep's role by
  // the server (a branch-manager only gets their own branch/teams, a
  // sales-team-lead only their own team) — this screen never decides who's
  // allowed to pick what, it just renders whatever the server offers.
  List<String> _audienceTypes = ['everyone'];
  List<String> _allBranches = [];
  List<Map<String, dynamic>> _allTeams = [];
  String _audienceType = 'everyone';
  final Set<String> _selectedBranches = {};
  final Set<String> _selectedTeamIds = {};
  String _audienceLabel = 'Everyone';

  static const Map<String, String> _audienceTypeLabel = {
    'everyone': 'Everyone',
    'branch': 'Specific branch(es)',
    'team': 'Specific team(s)',
  };

  @override
  void initState() {
    super.initState();
    _loadHistory();
    if (widget.canCompose) {
      _loadOptions();
    }
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

  Future<void> _loadOptions() async {
    try {
      final res = await api.get(
        Uri.parse('https://millerstorm.tech/api/announcements?options=1'),
      );
      if (res.statusCode == 200 && mounted) {
        final data = json.decode(res.body);
        final types = (data['types'] as List?)?.map((e) => e.toString()).toList() ?? ['everyone'];
        final branches = (data['branches'] as List?)?.map((e) => e.toString()).toList() ?? [];
        final teams = (data['teams'] as List?)?.whereType<Map<String, dynamic>>().toList() ?? [];
        setState(() {
          _audienceTypes = types;
          _allBranches = branches;
          _allTeams = teams;
          _audienceType = types.isNotEmpty ? types.first : 'everyone';
          // A sales-team-lead has exactly one team (their own) — pre-select it
          // so there's nothing extra to tap before sending.
          if (_audienceType == 'team' && teams.length == 1) {
            _selectedTeamIds.add(teams.first['id'].toString());
          }
        });
      }
    } catch (_) {}
    _loadRecipients();
  }

  Future<void> _loadRecipients() async {
    try {
      final params = <String, String>{'audienceType': _audienceType};
      if (_selectedBranches.isNotEmpty) params['branches'] = _selectedBranches.join(',');
      if (_selectedTeamIds.isNotEmpty) params['teamLeadIds'] = _selectedTeamIds.join(',');
      final uri = Uri.parse('https://millerstorm.tech/api/announcements')
          .replace(queryParameters: params);
      final res = await api.get(uri);
      if (res.statusCode == 200 && mounted) {
        final data = json.decode(res.body);
        final n = data['recipients'];
        setState(() {
          if (n is int) _recipients = n;
          if (data['audienceLabel'] != null) _audienceLabel = data['audienceLabel'].toString();
        });
      }
    } catch (_) {}
  }

  bool get _audienceReady =>
      _audienceType == 'everyone' ||
      (_audienceType == 'branch' && _selectedBranches.isNotEmpty) ||
      (_audienceType == 'team' && _selectedTeamIds.isNotEmpty);

  void _onAudienceTypeChanged(String? next) {
    if (next == null) return;
    setState(() {
      _audienceType = next;
      _selectedBranches.clear();
      _selectedTeamIds.clear();
    });
    _loadRecipients();
  }

  void _toggleBranch(String b) {
    setState(() {
      if (!_selectedBranches.add(b)) _selectedBranches.remove(b);
    });
    _loadRecipients();
  }

  void _toggleTeam(String id) {
    setState(() {
      if (!_selectedTeamIds.add(id)) _selectedTeamIds.remove(id);
    });
    _loadRecipients();
  }

  Future<void> _send() async {
    final title = _titleController.text.trim();
    final message = _messageController.text.trim();
    if (title.isEmpty || message.isEmpty || !_audienceReady || _sending) return;

    // Same deliberate confirm as the web composer — this cannot be recalled.
    final who = _recipients != null ? '$_recipients people ($_audienceLabel)' : _audienceLabel;
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
          'audience': _audienceType == 'everyone'
              ? {'type': 'everyone'}
              : _audienceType == 'branch'
                  ? {'type': 'branch', 'branches': _selectedBranches.toList()}
                  : {'type': 'team', 'teamLeadIds': _selectedTeamIds.toList()},
        }),
      );
      if (!mounted) return;
      if (res.statusCode == 200) {
        final data = json.decode(res.body);
        _titleController.clear();
        _messageController.clear();
        _linkController.clear();
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('✅ Sent to ${data['recipients']} people — ${data['audienceLabel'] ?? _audienceLabel}'),
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
            if (widget.canCompose) await _loadOptions();
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
        _audienceReady &&
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
            'In-app pop-up, the notification bell, and a phone push — for whoever you choose below.',
            style: TextStyle(fontSize: 12.5, color: _textLight),
          ),
          const SizedBox(height: 16),
          _fieldLabel('WHO WILL SEE THIS *'),
          _audiencePicker(),
          if (_audienceType == 'branch') ...[
            const SizedBox(height: 10),
            _audienceChips(_allBranches, _selectedBranches, _toggleBranch, emptyText: 'No branches found.'),
          ],
          if (_audienceType == 'team') ...[
            const SizedBox(height: 10),
            _audienceChips(
              _allTeams.map((t) => t['id'].toString()).toList(),
              _selectedTeamIds,
              _toggleTeam,
              labelFor: (id) => _allTeams.firstWhere((t) => t['id'].toString() == id)['name']?.toString() ?? id,
              emptyText: 'No teams found.',
            ),
          ],
          const SizedBox(height: 16),
          _fieldLabel('TITLE *'),
          _input(_titleController, 'e.g. AccuLynx Two-Factor Authentication', maxLength: 120),
          const SizedBox(height: 12),
          _fieldLabel('MESSAGE *'),
          _input(_messageController, 'A short, important message for your audience.', lines: 4),
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
                    : !_audienceReady
                        ? 'Pick ${_audienceType == 'branch' ? 'a branch' : 'a team'} to send to'
                        : _recipients != null
                            ? 'Send to $_recipients people'
                            : 'Send to $_audienceLabel',
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _audiencePicker() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: BoxDecoration(color: _bg, borderRadius: BorderRadius.circular(10)),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: _audienceType,
          isExpanded: true,
          // Nothing to pick from a single-option role (e.g. sales-team-lead
          // only ever has "team") — still shown, just not interactive, so the
          // field reads the same way across every composing role.
          onChanged: _audienceTypes.length > 1 ? _onAudienceTypeChanged : null,
          items: _audienceTypes
              .map((t) => DropdownMenuItem(value: t, child: Text(_audienceTypeLabel[t] ?? t, style: TextStyle(color: _textDark, fontSize: 14.5))))
              .toList(),
        ),
      ),
    );
  }

  Widget _audienceChips(
    List<String> values,
    Set<String> selected,
    void Function(String) onToggle, {
    String Function(String)? labelFor,
    required String emptyText,
  }) {
    if (values.isEmpty) {
      return Text(emptyText, style: TextStyle(fontSize: 12.5, color: _textLight));
    }
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: _bg, borderRadius: BorderRadius.circular(10)),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: values.map((v) {
          final active = selected.contains(v);
          return GestureDetector(
            onTap: () => onToggle(v),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: active ? _primary.withOpacity(0.12) : _surface,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: active ? _primary : _border),
              ),
              child: Text(
                labelFor != null ? labelFor(v) : v,
                style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: active ? _textDark : _textLight),
              ),
            ),
          );
        }).toList(),
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
    final audience = (a['audienceLabel'] ?? '').toString();
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
            [
              if (by.isNotEmpty) by,
              if (when.isNotEmpty) when,
              if (audience.isNotEmpty && audience != 'Everyone') audience,
            ].join(' · '),
            style: TextStyle(fontSize: 12, color: _textLight),
          ),
        ],
      ),
    );
  }
}
