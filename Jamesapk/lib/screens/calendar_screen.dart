import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'dart:convert';
import '../services/api_client.dart';
import '../theme/app_theme.dart';
import '../widgets/role_bottom_nav.dart';

/// My Calendar — this person's upcoming Google Calendar events, next 30 days.
/// Same shared-screen shape as AnnouncementsScreen/TicketScreen: one screen
/// for every role, reached from each role's drawer. Read-only — connecting
/// and disconnecting are the only writes this screen makes.
class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key});

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  static const Color _primary = Color(0xFFCB0002);
  Color get _bg => AppColors.bg;
  Color get _surface => AppColors.surface;
  Color get _textDark => AppColors.textDark;
  Color get _textLight => AppColors.textLight;
  Color get _border => AppColors.border;

  bool _loading = true;
  bool _loadFailed = false;
  bool? _connected;
  List<Map<String, dynamic>> _events = [];
  bool _connecting = false;
  bool _disconnecting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loadFailed = false);
    try {
      final res = await api.get(
        Uri.parse('https://millerstorm.tech/api/calendar/events'),
      );
      if (res.statusCode == 200 && mounted) {
        final data = json.decode(res.body) as Map<String, dynamic>;
        setState(() {
          _connected = data['connected'] == true;
          _events = (data['events'] as List?)?.whereType<Map<String, dynamic>>().toList() ?? [];
          _loading = false;
        });
        return;
      }
      if (mounted) setState(() => _loadFailed = true);
    } catch (_) {
      if (mounted) setState(() => _loadFailed = true);
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _connect() async {
    setState(() => _connecting = true);
    try {
      final res = await api.post(
        Uri.parse('https://millerstorm.tech/api/calendar/mobile-connect-link'),
      );
      if (res.statusCode == 200) {
        final data = json.decode(res.body) as Map<String, dynamic>;
        final url = (data['url'] ?? '').toString();
        final uri = Uri.tryParse(url);
        if (uri != null) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        }
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: const Text('❌ Could not start Google Calendar connect.'),
          backgroundColor: Colors.red[700],
        ));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: const Text('❌ Could not start Google Calendar connect.'),
          backgroundColor: Colors.red[700],
        ));
      }
    } finally {
      if (mounted) setState(() => _connecting = false);
    }
  }

  Future<void> _disconnect() async {
    setState(() => _disconnecting = true);
    try {
      await api.post(Uri.parse('https://millerstorm.tech/api/calendar/disconnect'));
      if (mounted) {
        setState(() {
          _connected = false;
          _events = [];
        });
      }
    } finally {
      if (mounted) setState(() => _disconnecting = false);
    }
  }

  String _fmtEventTime(Map<String, dynamic> ev) {
    final allDay = ev['allDay'] == true;
    final start = (ev['start'] ?? '').toString();
    if (allDay) {
      final dt = DateTime.tryParse(start);
      if (dt == null) return '';
      return '${_weekday(dt)}, ${_month(dt)} ${dt.day} · All day';
    }
    final dt = DateTime.tryParse(start)?.toLocal();
    if (dt == null) return '';
    final hour = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
    final minute = dt.minute.toString().padLeft(2, '0');
    final ampm = dt.hour < 12 ? 'AM' : 'PM';
    return '${_weekday(dt)}, ${_month(dt)} ${dt.day} · $hour:$minute $ampm';
  }

  static const _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  static const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  String _weekday(DateTime dt) => _weekdays[dt.weekday - 1];
  String _month(DateTime dt) => _months[dt.month - 1];

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: themeController,
      builder: (context, _) => Scaffold(
        backgroundColor: _bg,
        drawer: const RoleBottomNav(),
        appBar: AppBar(
          backgroundColor: _primary,
          elevation: 0,
          iconTheme: const IconThemeData(color: Colors.white),
          title: const Text(
            'My Calendar',
            style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
          ),
        ),
        body: RefreshIndicator(
          color: _primary,
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (_loading)
                const Padding(
                  padding: EdgeInsets.all(40),
                  child: Center(child: CircularProgressIndicator(color: _primary)),
                )
              else if (_loadFailed)
                Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    children: [
                      Icon(Icons.error_outline, size: 56, color: _textLight.withOpacity(0.4)),
                      const SizedBox(height: 12),
                      Text('Your calendar could not be loaded.',
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: _textDark)),
                      const SizedBox(height: 12),
                      TextButton(onPressed: _load, child: const Text('Try again')),
                    ],
                  ),
                )
              else if (_connected != true)
                _connectCard()
              else
                _eventsList(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _connectCard() {
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
          Text('Connect your calendar',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: _textDark)),
          const SizedBox(height: 6),
          Text(
            'Connect your Google Calendar to see your upcoming events here.',
            style: TextStyle(fontSize: 13.5, color: _textLight),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _connecting ? null : _connect,
              style: ElevatedButton.styleFrom(
                backgroundColor: _primary,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              child: Text(
                _connecting ? 'Opening…' : 'Connect Google Calendar',
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _eventsList() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('NEXT 30 DAYS',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: _textLight)),
            TextButton(
              onPressed: _disconnecting ? null : _disconnect,
              child: Text(_disconnecting ? 'Disconnecting…' : 'Disconnect'),
            ),
          ],
        ),
        const SizedBox(height: 6),
        if (_events.isEmpty)
          Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              children: [
                Icon(Icons.event_outlined, size: 56, color: _textLight.withOpacity(0.4)),
                const SizedBox(height: 12),
                Text('No upcoming events in the next 30 days.',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: _textDark)),
              ],
            ),
          )
        else
          ..._events.map(_eventCard),
      ],
    );
  }

  Widget _eventCard(Map<String, dynamic> ev) {
    final title = (ev['title'] ?? '').toString();
    final location = (ev['location'] ?? '').toString();
    final link = (ev['htmlLink'] ?? '').toString();
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
                child: const Icon(Icons.event, color: _primary, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(title.isEmpty ? '(No title)' : title,
                    style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: _textDark)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            [_fmtEventTime(ev), if (location.isNotEmpty) location].join(' · '),
            style: TextStyle(fontSize: 12.5, color: _textLight),
          ),
          if (link.isNotEmpty) ...[
            const SizedBox(height: 10),
            GestureDetector(
              onTap: () {
                final uri = Uri.tryParse(link);
                if (uri != null) launchUrl(uri, mode: LaunchMode.externalApplication);
              },
              child: const Text('Open →',
                  style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: _primary)),
            ),
          ],
        ],
      ),
    );
  }
}
