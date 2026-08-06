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

  // Support categories — mirrors src/lib/support/categories.ts on the web. The
  // per-category email routing is handled server-side in /api/tickets; the app
  // just sends the category `key`, the free-text note, and the predefined
  // `fields`. Keep this list in sync with the web config.
  static const List<Map<String, dynamic>> _categories = [
    {
      'key': 'billing',
      'label': 'Billing',
      'reason': 'Commission issues',
      'fields': [
        {'key': 'acculynxJob', 'label': 'Acculynx Job# (if available)', 'type': 'text', 'placeholder': 'e.g. 12345'},
      ],
    },
    {
      'key': 'draw_request',
      'label': 'Draw Request',
      'reason': 'Job draw requests',
      'fields': [
        {'key': 'acculynxJob', 'label': 'Acculynx Job# (if available)', 'type': 'text', 'placeholder': 'e.g. 12345'},
        {'key': 'amount', 'label': 'Amount', 'type': 'text', 'placeholder': 'e.g. \$1,200'},
      ],
    },
    {
      'key': 'tech',
      'label': 'Miller Storm Tech',
      'reason': 'App or Web issues',
      'fields': [],
    },
    {
      'key': 'msrr_tools',
      'label': 'MSRR Tools Issue',
      'reason': 'Issues with tools',
      'fields': [
        {'key': 'msrrTool', 'label': 'Which MSRR tool?', 'type': 'select', 'required': true, 'options': ['Acculynx', 'Rep Card', 'Hail Trace']},
      ],
    },
  ];

  static const _legacyLabels = {
    'bug': 'Bug / Issue Fix',
    'feature': 'Request New Feature',
    'other': 'Other',
  };

  // Name and email come from the signed-in account (no longer typed).
  String _name = '';
  String _email = '';
  String _type = ''; // '' = Not Selected
  final Map<String, String> _fields = {};
  final Map<String, TextEditingController> _fieldCtrls = {};
  final _noteCtrl = TextEditingController();

  bool _submitting = false;
  bool _loadingList = true;
  List<dynamic> _tickets = [];

  static const _statusLabel = {
    'open': 'Open',
    'approved': 'Approved',
    'in_progress': 'In Progress',
    'completed': 'Completed',
    'rejected': 'Rejected',
  };
  static const _statusBg = {
    'open': Color(0xFFDBEAFE),
    'approved': Color(0xFF15803D),
    'in_progress': Color(0xFFDCFCE7),
    'completed': Color(0xFFFEE2E2),
    'rejected': Color(0xFFDC2626),
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
    for (final c in _fieldCtrls.values) {
      c.dispose();
    }
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadUser() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userStr = prefs.getString('user');
      if (userStr != null) {
        final user = jsonDecode(userStr);
        _name = user['name']?.toString() ?? '';
        _email = user['email']?.toString() ?? '';
      }
    } catch (_) {}
  }

  Map<String, dynamic>? get _category {
    for (final c in _categories) {
      if (c['key'] == _type) return c;
    }
    return null;
  }

  List<Map<String, dynamic>> get _categoryFields =>
      List<Map<String, dynamic>>.from(_category?['fields'] as List? ?? const []);

  String _typeLabelFor(String key) {
    for (final c in _categories) {
      if (c['key'] == key) return c['label'] as String;
    }
    return _legacyLabels[key] ?? key;
  }

  // When the reason changes, reset the predefined field values + controllers.
  void _onReasonChanged(String key) {
    setState(() {
      _type = key;
      _fields.clear();
      for (final c in _fieldCtrls.values) {
        c.dispose();
      }
      _fieldCtrls.clear();
      for (final f in _categoryFields) {
        if (f['type'] == 'text') {
          _fieldCtrls[f['key'] as String] = TextEditingController();
        }
      }
    });
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
    if (_type.isEmpty) {
      _toast('Please select a reason.');
      return;
    }
    if (_noteCtrl.text.trim().isEmpty) {
      _toast('Please add a description.');
      return;
    }
    // Any required predefined field must be filled.
    for (final f in _categoryFields) {
      if (f['required'] == true && (_fields[f['key']] ?? '').trim().isEmpty) {
        _toast('Please fill "${f['label']}".');
        return;
      }
    }
    setState(() => _submitting = true);
    try {
      final res = await api.post(
        Uri.parse('https://millerstorm.tech/api/tickets'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'name': _name,
          'email': _email,
          'type': _type,
          'note': _noteCtrl.text.trim(),
          'fields': _fields,
        }),
      );
      if (res.statusCode == 201 || res.statusCode == 200) {
        _noteCtrl.clear();
        _fields.clear();
        for (final c in _fieldCtrls.values) {
          c.clear();
        }
        _toast('✅ Sent to Support!');
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
        title: const Text('Support',
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
                _label('Reason', required: true),
                Container(
                  decoration: BoxDecoration(
                    border: Border.all(color: const Color(0xFFD1D5DB)),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: _type.isEmpty ? null : _type,
                      isExpanded: true,
                      hint: const Text('Not Selected'),
                      items: _categories
                          .map((c) => DropdownMenuItem(
                                value: c['key'] as String,
                                child: Text('${c['label']} — ${c['reason']}',
                                    overflow: TextOverflow.ellipsis),
                              ))
                          .toList(),
                      onChanged: (v) { if (v != null) _onReasonChanged(v); },
                    ),
                  ),
                ),

                // Predefined fields for the selected reason (Option 2).
                for (final f in _categoryFields) ...[
                  const SizedBox(height: 14),
                  _label('${f['label']}${f['required'] == true ? ' *' : ''}'),
                  if (f['type'] == 'select')
                    Container(
                      decoration: BoxDecoration(
                        border: Border.all(color: const Color(0xFFD1D5DB)),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          value: (_fields[f['key']] ?? '').isEmpty ? null : _fields[f['key']],
                          isExpanded: true,
                          hint: const Text('Select…'),
                          items: List<String>.from(f['options'] as List? ?? const [])
                              .map((o) => DropdownMenuItem(value: o, child: Text(o)))
                              .toList(),
                          onChanged: (v) => setState(() => _fields[f['key'] as String] = v ?? ''),
                        ),
                      ),
                    )
                  else
                    _fieldInput(
                      _fieldCtrls[f['key']]!,
                      (f['placeholder'] ?? '') as String,
                      (v) => _fields[f['key'] as String] = v,
                    ),
                ],

                const SizedBox(height: 14),
                _label('Description', required: true),
                _fieldInput(_noteCtrl, 'Describe the issue or request...', null, maxLines: 4),
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

  // Readable "Label: value" lines for a ticket's stored field values.
  List<String> _fieldLines(dynamic t) {
    final type = t['type']?.toString() ?? '';
    final fields = (t['fields'] as Map?) ?? const {};
    Map<String, dynamic>? cat;
    for (final c in _categories) {
      if (c['key'] == type) cat = c;
    }
    if (cat == null) return [];
    final lines = <String>[];
    for (final f in List<Map<String, dynamic>>.from(cat['fields'] as List? ?? const [])) {
      final v = (fields[f['key']] ?? '').toString().trim();
      if (v.isNotEmpty) {
        final label = (f['label'] as String).replaceAll(RegExp(r'\s*\(if available\)', caseSensitive: false), '');
        lines.add('$label: $v');
      }
    }
    return lines;
  }

  Widget _ticketCard(dynamic t) {
    final status = t['status']?.toString() ?? 'open';
    final type = t['type']?.toString() ?? 'other';
    final lines = _fieldLines(t);
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
                child: Text(_typeLabelFor(type),
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
          for (final line in lines)
            Text(line, style: const TextStyle(color: Color(0xFF374151), fontSize: 12, fontWeight: FontWeight.w600)),
          if (lines.isNotEmpty) const SizedBox(height: 4),
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

  Widget _label(String text, {bool required = false}) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: RichText(
          text: TextSpan(
            text: text,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _textMedium),
            children: required
                ? const [TextSpan(text: ' *', style: TextStyle(color: _primary, fontWeight: FontWeight.w700))]
                : const [],
          ),
        ),
      );

  Widget _fieldInput(TextEditingController c, String hint, ValueChanged<String>? onChanged,
          {int maxLines = 1}) =>
      TextField(
        controller: c,
        maxLines: maxLines,
        onChanged: onChanged,
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
