import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import '../services/api_client.dart';

class TicketScreen extends StatefulWidget {
  const TicketScreen({super.key});

  @override
  State<TicketScreen> createState() => _TicketScreenState();
}

class _TicketScreenState extends State<TicketScreen> {
  static const _bg = Color(0xFFF3F4F6);
  static const _white = Color(0xFFFFFFFF);
  static const _primary = Color(0xFFCB0002);
  static const _textDark = Color(0xFF111827);
  static const _textMedium = Color(0xFF374151);

  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();
  String _type = 'bug';
  bool _submitting = false;
  bool _loadingList = true;
  List<dynamic> _tickets = [];

  static const _typeLabel = {
    'bug': 'Bug / Issue Fix',
    'feature': 'Request New Feature',
    'other': 'Other',
  };
  static const _statusLabel = {
    'open': 'Open',
    'approved': 'Approved',
    'in_progress': 'In Progress',
    'completed': 'Completed',
    'rejected': 'Rejected',
  };
  static const _statusBg = {
    'open': Color(0xFFDBEAFE),       // light blue
    'approved': Color(0xFF15803D),   // dark green
    'in_progress': Color(0xFFDCFCE7),// light green
    'completed': Color(0xFFFEE2E2),  // light red
    'rejected': Color(0xFFDC2626),   // red
  };
  static const _statusFg = {
    'open': Color(0xFF1E40AF),
    'approved': Color(0xFFFFFFFF),
    'in_progress': Color(0xFF166534),
    'completed': Color(0xFFB91C1C),
    'rejected': Color(0xFFFFFFFF),
  };

  @override
  void initState() {
    super.initState();
    _loadUser();
    _loadTickets();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadUser() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userStr = prefs.getString('user');
      if (userStr != null) {
        final user = jsonDecode(userStr);
        setState(() {
          _nameCtrl.text = user['name']?.toString() ?? '';
          _emailCtrl.text = user['email']?.toString() ?? '';
        });
      }
    } catch (_) {}
  }

  Future<void> _loadTickets() async {
    try {
      final res = await api.get(Uri.parse('https://millerstorm.tech/api/tickets'));
      if (res.statusCode == 200) {
        setState(() => _tickets = jsonDecode(res.body) as List<dynamic>);
      }
    } catch (_) {} finally {
      if (mounted) setState(() => _loadingList = false);
    }
  }

  Future<void> _submit() async {
    if (_nameCtrl.text.trim().isEmpty ||
        _emailCtrl.text.trim().isEmpty ||
        _noteCtrl.text.trim().isEmpty) {
      _toast('Please fill name, email and details.');
      return;
    }
    setState(() => _submitting = true);
    try {
      final res = await api.post(
        Uri.parse('https://millerstorm.tech/api/tickets'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'name': _nameCtrl.text.trim(),
          'email': _emailCtrl.text.trim(),
          'type': _type,
          'note': _noteCtrl.text.trim(),
        }),
      );
      if (res.statusCode == 201 || res.statusCode == 200) {
        _noteCtrl.clear();
        _toast('✅ Ticket sent to admin!');
        _loadTickets();
      } else {
        _toast('Something went wrong. Try again.');
      }
    } catch (_) {
      _toast('Network error. Try again.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _primary,
        title: const Text('Raise a Ticket',
            style: TextStyle(color: _white, fontSize: 20, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: _white),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _label("What's your name?"),
                _field(_nameCtrl, 'Your name'),
                const SizedBox(height: 14),
                _label('Email'),
                _field(_emailCtrl, 'you@example.com',
                    keyboard: TextInputType.emailAddress),
                const SizedBox(height: 14),
                _label('Reason'),
                Container(
                  decoration: BoxDecoration(
                    border: Border.all(color: const Color(0xFFD1D5DB)),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: _type,
                      isExpanded: true,
                      items: const [
                        DropdownMenuItem(value: 'bug', child: Text('Bug / Issue Fix')),
                        DropdownMenuItem(value: 'feature', child: Text('Request New Feature')),
                        DropdownMenuItem(value: 'other', child: Text('Other')),
                      ],
                      onChanged: (v) => setState(() => _type = v ?? 'bug'),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                _label('Note'),
                _field(_noteCtrl, 'Describe the issue or request...', maxLines: 4),
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _submitting ? null : _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _textDark,
                      foregroundColor: _white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
                    ),
                    child: Text(_submitting ? 'Sending...' : 'Send to Admin',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          const Padding(
            padding: EdgeInsets.only(left: 4, bottom: 10),
            child: Text('Your Tickets',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: _textDark)),
          ),
          if (_loadingList)
            const Center(child: Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator()))
          else if (_tickets.isEmpty)
            _card(child: const Text("You haven't raised any tickets yet.",
                style: TextStyle(color: Color(0xFF9CA3AF))))
          else
            ..._tickets.map(_ticketCard),
        ],
      ),
    );
  }

  Widget _ticketCard(dynamic t) {
    final status = t['status']?.toString() ?? 'open';
    final type = t['type']?.toString() ?? 'other';
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(_typeLabel[type] ?? type,
                    style: const TextStyle(fontWeight: FontWeight.w600, color: _textDark)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                decoration: BoxDecoration(
                  color: _statusBg[status] ?? _statusBg['open'],
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(_statusLabel[status] ?? status,
                    style: TextStyle(
                        color: _statusFg[status] ?? _statusFg['open'],
                        fontWeight: FontWeight.bold,
                        fontSize: 11)),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(t['note']?.toString() ?? '',
              style: const TextStyle(color: Color(0xFF6B7280), fontSize: 13)),
        ],
      ),
    );
  }

  Widget _card({required Widget child}) => Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: _white,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8)],
        ),
        child: child,
      );

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _textMedium)),
      );

  Widget _field(TextEditingController c, String hint,
          {int maxLines = 1, TextInputType? keyboard}) =>
      TextField(
        controller: c,
        maxLines: maxLines,
        keyboardType: keyboard,
        decoration: InputDecoration(
          hintText: hint,
          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: Color(0xFFD1D5DB)),
          ),
        ),
      );
}
