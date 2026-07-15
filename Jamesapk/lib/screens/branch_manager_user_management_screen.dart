import 'package:flutter/material.dart';
import 'dart:convert';
import '../services/api_client.dart';
import '../widgets/branch_manager_bottom_nav.dart';

/// C-Level User Management — the mobile equivalent of the admin/C-Level web
/// "User Management" screen. Company-wide: list, search, create, edit, suspend
/// and delete/restore any user.
class BranchManagerUserManagementScreen extends StatefulWidget {
  const BranchManagerUserManagementScreen({super.key});

  @override
  State<BranchManagerUserManagementScreen> createState() => _BranchManagerUserManagementScreenState();
}

class _BranchManagerUserManagementScreenState extends State<BranchManagerUserManagementScreen> {
  static const _bg = Color(0xFFF3F4F6);
  static const _white = Color(0xFFFFFFFF);
  static const _primary = Color(0xFFCB0002);
  static const _textDark = Color(0xFF111827);
  static const _textLight = Color(0xFF6B7280);
  static const _border = Color(0xFFD1D5DB);

  // role key -> display label (order = display order)
  static const List<List<String>> _roles = [
    ['sales', 'Sales Rep'],
    ['sales-team-lead', 'Sales Team Lead'],
    ['branch-manager', 'Branch Manager'],
    ['c-level', 'C-Level'],
    ['marketing', 'Marketing'],
    ['admin', 'Admin'],
  ];

  // Territory options (same as the web User Management dropdown).
  static const List<String> _territories = ['Dallas', 'West Texas', 'Fort Worth'];

  List<dynamic> _active = [];
  List<dynamic> _deleted = [];
  bool _loading = true;
  bool _showDeleted = false;
  String _search = '';

  @override
  void initState() {
    super.initState();
    _fetchUsers();
  }

  Future<void> _fetchUsers() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        api.get(Uri.parse('https://millerstorm.tech/api/users?deleted=false')),
        api.get(Uri.parse('https://millerstorm.tech/api/users?deleted=true')),
      ]);
      if (results[0].statusCode == 200) {
        _active = jsonDecode(results[0].body) as List;
      }
      if (results[1].statusCode == 200) {
        _deleted = jsonDecode(results[1].body) as List;
      }
    } catch (e) {
      _toast('Failed to load users');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _toast(String msg, {Color? color}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: color ?? _primary),
    );
  }

  static String _roleLabel(String? key) {
    for (final r in _roles) {
      if (r[0] == key) return r[1];
    }
    return key ?? '—';
  }

  List<dynamic> get _filtered {
    final source = _showDeleted ? _deleted : _active;
    if (_search.trim().isEmpty) return source;
    final q = _search.toLowerCase();
    return source.where((u) {
      final name = (u['name'] ?? '').toString().toLowerCase();
      final email = (u['email'] ?? '').toString().toLowerCase();
      return name.contains(q) || email.contains(q);
    }).toList();
  }

  // ---- actions ---------------------------------------------------------

  Map<String, dynamic> _allTogglesTrue() {
    const keys = [
      'dashboard','userManagement','roleHierarchy','businessUnits','salesOverview',
      'marketingOverview','courseManagement','materialsLibrary','approvalWorkflows','aiBots',
      'webTemplates','webText','appsTools','socialMediaMetrics','team','plans','training',
      'onlineTraining','taskTracker','profile','plan','materials','aiChat','webPage',
      'businessCards','assets','approvals','socialMetrics','featureToggles','systemSettings',
      'teamBusinessPlans','teamFunnelMetrics','teamTraining','aiAssistant','businessPlan',
      'trainingCenter','marketingMaterials','repWebPage','assetLibrary','contentApprovals',
      'courseAiBots','messaging','leaderboard','teamStructure','stormChat',
    ];
    return {for (final k in keys) k: true};
  }

  Future<void> _createUser(Map<String, dynamic> form) async {
    final id = 'user-${DateTime.now().millisecondsSinceEpoch}';
    final body = {
      'id': id,
      'name': form['name'],
      'email': form['email'],
      'password': form['password'] ?? '',
      'role': form['role'],
      'roles': [form['role']],
      'phone': form['phone'] ?? '',
      'territory': form['territory'] ?? '',
      'managerId': form['managerId'],
      'strengths': '',
      'weaknesses': '',
      'publicProfile': {
        'showHeadshot': true, 'showEmail': true, 'showPhone': true,
        'showStrengths': true, 'showWeaknesses': true, 'showTerritory': true,
      },
      'featureToggles': _allTogglesTrue(),
    };
    try {
      final res = await api.post(
        Uri.parse('https://millerstorm.tech/api/users'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(body),
      );
      if (res.statusCode == 200 || res.statusCode == 201) {
        _toast('User created', color: const Color(0xFF16A34A));
        await _fetchUsers();
      } else {
        _toast('Create failed: ${res.statusCode}');
      }
    } catch (e) {
      _toast('Create failed');
    }
  }

  Future<void> _saveUser(Map<String, dynamic> original, Map<String, dynamic> form) async {
    final id = (original['id'] ?? original['_id']).toString();
    final body = Map<String, dynamic>.from(original);
    body['name'] = form['name'];
    body['email'] = form['email'];
    body['role'] = form['role'];
    if (form['role'] != original['role']) body['roles'] = [form['role']];
    body['phone'] = form['phone'] ?? '';
    body['territory'] = form['territory'] ?? '';
    body['managerId'] = form['managerId'];
    if ((form['password'] ?? '').toString().isNotEmpty) {
      body['password'] = form['password'];
    }
    try {
      final res = await api.put(
        Uri.parse('https://millerstorm.tech/api/users/${Uri.encodeComponent(id)}'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(body),
      );
      if (res.statusCode == 200) {
        _toast('Saved', color: const Color(0xFF16A34A));
        await _fetchUsers();
      } else {
        _toast('Save failed: ${res.statusCode}');
      }
    } catch (e) {
      _toast('Save failed');
    }
  }

  Future<void> _toggleSuspend(Map<String, dynamic> user) async {
    final id = (user['id'] ?? user['_id']).toString();
    final next = !(user['suspended'] == true);
    final body = Map<String, dynamic>.from(user)..['suspended'] = next;
    try {
      final res = await api.put(
        Uri.parse('https://millerstorm.tech/api/users/${Uri.encodeComponent(id)}'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(body),
      );
      if (res.statusCode == 200) {
        _toast(next ? 'User suspended' : 'User unsuspended', color: const Color(0xFF16A34A));
        await _fetchUsers();
      } else {
        _toast('Failed: ${res.statusCode}');
      }
    } catch (e) {
      _toast('Failed');
    }
  }

  Future<void> _deleteUser(Map<String, dynamic> user) async {
    final id = (user['id'] ?? user['_id']).toString();
    try {
      final res = await api.delete(
        Uri.parse('https://millerstorm.tech/api/users/${Uri.encodeComponent(id)}'),
      );
      if (res.statusCode == 200) {
        _toast('User deleted', color: const Color(0xFF16A34A));
        await _fetchUsers();
      } else {
        _toast('Delete failed: ${res.statusCode}');
      }
    } catch (e) {
      _toast('Delete failed');
    }
  }

  Future<void> _patchAction(Map<String, dynamic> user, String action) async {
    final id = (user['id'] ?? user['_id']).toString();
    try {
      final res = await api.patch(
        Uri.parse('https://millerstorm.tech/api/users/${Uri.encodeComponent(id)}'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'action': action}),
      );
      if (res.statusCode == 200) {
        _toast(action == 'restore' ? 'User restored' : 'Permanently deleted',
            color: const Color(0xFF16A34A));
        await _fetchUsers();
      } else {
        _toast('Failed: ${res.statusCode}');
      }
    } catch (e) {
      _toast('Failed');
    }
  }

  // ---- UI --------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      onWillPop: () async {
        Navigator.pushReplacementNamed(context, '/bm-training');
        return false;
      },
      child: Scaffold(
        backgroundColor: _bg,
        body: SafeArea(
          child: Column(
            children: [
              _header(),
              _searchBar(),
              _segmented(),
              Expanded(
                child: _loading
                    ? const Center(child: CircularProgressIndicator(color: _primary))
                    : RefreshIndicator(
                        color: _primary,
                        onRefresh: _fetchUsers,
                        child: _list(),
                      ),
              ),
            ],
          ),
        ),
        bottomNavigationBar: const BranchManagerBottomNav(active: 'users'),
      ),
    );
  }

  Widget _header() {
    return Container(
      width: double.infinity,
      color: _white,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      child: Row(
        children: [
          const Expanded(
            child: Text('User Management',
                style: TextStyle(color: _textDark, fontSize: 18, fontWeight: FontWeight.w700)),
          ),
          TextButton.icon(
            onPressed: () => _openEditor(null),
            icon: const Icon(Icons.add, size: 18, color: _white),
            label: const Text('Add', style: TextStyle(color: _white, fontWeight: FontWeight.w600)),
            style: TextButton.styleFrom(
              backgroundColor: _primary,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _searchBar() {
    return Container(
      color: _white,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: TextField(
        onChanged: (v) => setState(() => _search = v),
        decoration: InputDecoration(
          hintText: 'Search by name or email',
          prefixIcon: const Icon(Icons.search, color: _textLight, size: 20),
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(vertical: 10),
          filled: true,
          fillColor: _bg,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: _border),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: _border),
          ),
        ),
      ),
    );
  }

  Widget _segmented() {
    Widget tab(String label, bool selected, int count, VoidCallback onTap) {
      return Expanded(
        child: GestureDetector(
          onTap: onTap,
          behavior: HitTestBehavior.opaque,
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              border: Border(
                bottom: BorderSide(
                  color: selected ? _primary : Colors.transparent,
                  width: 2,
                ),
              ),
            ),
            child: Text(
              '$label ($count)',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: selected ? _primary : _textLight,
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      color: _white,
      child: Row(
        children: [
          tab('Active', !_showDeleted, _active.length, () => setState(() => _showDeleted = false)),
          tab('Deleted', _showDeleted, _deleted.length, () => setState(() => _showDeleted = true)),
        ],
      ),
    );
  }

  Widget _list() {
    final items = _filtered;
    if (items.isEmpty) {
      return ListView(
        children: [
          const SizedBox(height: 80),
          Center(
            child: Text(_showDeleted ? 'No deleted users' : 'No users found',
                style: const TextStyle(color: _textLight, fontSize: 15)),
          ),
        ],
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.all(12),
      itemCount: items.length,
      itemBuilder: (_, i) => _userCard(Map<String, dynamic>.from(items[i])),
    );
  }

  Widget _userCard(Map<String, dynamic> user) {
    final name = (user['name'] ?? 'Unnamed').toString();
    final email = (user['email'] ?? '').toString();
    final suspended = user['suspended'] == true;
    final img = (user['headshotUrl'] ?? '').toString();
    final initial = name.trim().isNotEmpty ? name.trim()[0].toUpperCase() : '?';

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: _white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _border),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: const Color(0xFF374151),
              image: img.isNotEmpty
                  ? DecorationImage(image: NetworkImage('https://millerstorm.tech$img'), fit: BoxFit.cover)
                  : null,
            ),
            alignment: Alignment.center,
            child: img.isEmpty
                ? Text(initial, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold))
                : null,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: _textDark)),
                    ),
                    if (suspended)
                      Container(
                        margin: const EdgeInsets.only(left: 6),
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                            color: const Color(0xFFFEE2E2), borderRadius: BorderRadius.circular(6)),
                        child: const Text('Suspended',
                            style: TextStyle(fontSize: 10, color: _primary, fontWeight: FontWeight.w600)),
                      ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(email,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12, color: _textLight)),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: _bg, borderRadius: BorderRadius.circular(6)),
                  child: Text(_roleLabel(user['role']?.toString()),
                      style: const TextStyle(fontSize: 11, color: _textDark, fontWeight: FontWeight.w500)),
                ),
              ],
            ),
          ),
          _showDeleted
              ? Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.restore, color: Color(0xFF16A34A)),
                      tooltip: 'Restore',
                      onPressed: () => _confirm('Restore ${name}?', () => _patchAction(user, 'restore')),
                    ),
                    IconButton(
                      icon: const Icon(Icons.delete_forever, color: _primary),
                      tooltip: 'Delete permanently',
                      onPressed: () => _confirm(
                          'PERMANENTLY delete $name? This cannot be undone.',
                          () => _patchAction(user, 'permanent-delete')),
                    ),
                  ],
                )
              : IconButton(
                  icon: const Icon(Icons.chevron_right, color: _textLight),
                  onPressed: () => _openEditor(user),
                ),
        ],
      ),
    );
  }

  Future<void> _confirm(String message, VoidCallback onYes) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        content: Text(message),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirm', style: TextStyle(color: _primary)),
          ),
        ],
      ),
    );
    if (ok == true) onYes();
  }

  // Bottom-sheet editor for both create (user == null) and edit.
  void _openEditor(Map<String, dynamic>? user) {
    final isNew = user == null;
    final nameC = TextEditingController(text: user?['name']?.toString() ?? '');
    final emailC = TextEditingController(text: user?['email']?.toString() ?? '');
    final phoneC = TextEditingController(text: user?['phone']?.toString() ?? '');
    final passC = TextEditingController();
    String territory = user?['territory']?.toString() ?? '';
    String? managerId = user?['managerId']?.toString();
    String role = (user?['role']?.toString().isNotEmpty ?? false) ? user!['role'].toString() : 'sales';
    // Sales Team Leads to choose from when assigning a sales rep's manager.
    final teamLeads = _active.where((u) => u['role'] == 'sales-team-lead' || ((u['roles'] as List?)?.contains('sales-team-lead') ?? false)).toList();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: _white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return StatefulBuilder(builder: (ctx, setSheet) {
          final suspended = user?['suspended'] == true;
          return Padding(
            padding: EdgeInsets.only(
              left: 20, right: 20, top: 20,
              bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(isNew ? 'Add User' : 'Edit User',
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: _textDark)),
                      ),
                      IconButton(onPressed: () => Navigator.pop(ctx), icon: const Icon(Icons.close, color: _textLight)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  _field('Name', nameC),
                  _field('Email', emailC, keyboard: TextInputType.emailAddress),
                  _field('Phone', phoneC, keyboard: TextInputType.phone),
                  const SizedBox(height: 6),
                  const Text('Branch', style: TextStyle(fontSize: 13, color: _textLight, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                        color: _bg, borderRadius: BorderRadius.circular(10), border: Border.all(color: _border)),
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<String>(
                        value: territory.isEmpty ? null : territory,
                        isExpanded: true,
                        hint: const Text('Select branch'),
                        items: [
                          ..._territories,
                          if (territory.isNotEmpty && !_territories.contains(territory)) territory,
                        ].map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(),
                        onChanged: (v) => setSheet(() => territory = v ?? ''),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  _field(isNew ? 'Password' : 'Reset Password', passC,
                      obscure: true, hint: isNew ? 'Set a login password' : 'Leave blank to keep current'),
                  const SizedBox(height: 6),
                  const Text('Role', style: TextStyle(fontSize: 13, color: _textLight, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                        color: _bg, borderRadius: BorderRadius.circular(10), border: Border.all(color: _border)),
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<String>(
                        value: role,
                        isExpanded: true,
                        items: _roles
                            .map((r) => DropdownMenuItem(value: r[0], child: Text(r[1])))
                            .toList(),
                        onChanged: (v) => setSheet(() => role = v ?? role),
                      ),
                    ),
                  ),
                  if (role == 'sales') ...[
                    const SizedBox(height: 12),
                    Row(children: const [
                      Text('Sales Team Lead ', style: TextStyle(fontSize: 13, color: _textLight, fontWeight: FontWeight.w600)),
                      Text('*', style: TextStyle(fontSize: 13, color: _primary, fontWeight: FontWeight.w700)),
                    ]),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: BoxDecoration(
                          color: _bg, borderRadius: BorderRadius.circular(10), border: Border.all(color: _border)),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          value: teamLeads.any((m) => (m['id'] ?? m['_id']).toString() == managerId) ? managerId : null,
                          isExpanded: true,
                          hint: const Text('Select a Sales Team Lead'),
                          items: teamLeads
                              .map((m) => DropdownMenuItem(
                                    value: (m['id'] ?? m['_id']).toString(),
                                    child: Text((m['name'] ?? 'Unknown').toString()),
                                  ))
                              .toList(),
                          onChanged: (v) => setSheet(() => managerId = v),
                        ),
                      ),
                    ),
                  ],
                  // Branch Manager — auto-filled from the selected Branch (the
                  // branch-manager account whose Branch matches). Read-only.
                  if ((role == 'sales' || role == 'sales-team-lead') && territory.trim().isNotEmpty) ...[
                    const SizedBox(height: 12),
                    const Text('Branch Manager', style: TextStyle(fontSize: 13, color: _textLight, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 6),
                    Builder(builder: (_) {
                      final bm = _active.firstWhere(
                        (u) => (u['role'] == 'branch-manager' || ((u['roles'] as List?)?.contains('branch-manager') ?? false)) &&
                            (u['territory'] ?? '').toString().trim().toLowerCase() == territory.trim().toLowerCase(),
                        orElse: () => null,
                      );
                      final name = bm != null ? (bm['name'] ?? '').toString() : 'No branch manager set for this branch';
                      return Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
                        decoration: BoxDecoration(color: _bg, borderRadius: BorderRadius.circular(10), border: Border.all(color: _border)),
                        child: Text(name,
                            style: TextStyle(fontSize: 14, color: bm != null ? _textDark : const Color(0xFF9CA3AF))),
                      );
                    }),
                  ],
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _primary,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      onPressed: () async {
                        if (nameC.text.trim().isEmpty || emailC.text.trim().isEmpty) {
                          _toast('Name and email are required');
                          return;
                        }
                        if (role == 'sales' && (managerId == null || managerId!.isEmpty)) {
                          _toast('Please assign a Sales Team Lead to this sales rep');
                          return;
                        }
                        final form = {
                          'name': nameC.text.trim(),
                          'email': emailC.text.trim(),
                          'phone': phoneC.text.trim(),
                          'territory': territory,
                          'password': passC.text,
                          'role': role,
                          'managerId': role == 'sales' ? managerId : null,
                        };
                        Navigator.pop(ctx);
                        if (isNew) {
                          await _createUser(form);
                        } else {
                          await _saveUser(user, form);
                        }
                      },
                      child: Text(isNew ? 'Create User' : 'Save Changes',
                          style: const TextStyle(color: _white, fontSize: 15, fontWeight: FontWeight.w600)),
                    ),
                  ),
                  if (!isNew) ...[
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              side: const BorderSide(color: _border),
                              padding: const EdgeInsets.symmetric(vertical: 12),
                            ),
                            onPressed: () async {
                              Navigator.pop(ctx);
                              await _toggleSuspend(user);
                            },
                            child: Text(suspended ? 'Unsuspend' : 'Suspend',
                                style: const TextStyle(color: _textDark)),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              side: const BorderSide(color: _primary),
                              padding: const EdgeInsets.symmetric(vertical: 12),
                            ),
                            onPressed: () {
                              Navigator.pop(ctx);
                              _confirm('Delete $nameC.text?', () => _deleteUser(user));
                            },
                            child: const Text('Delete', style: TextStyle(color: _primary)),
                          ),
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 8),
                ],
              ),
            ),
          );
        });
      },
    );
  }

  Widget _field(String label, TextEditingController c,
      {bool obscure = false, TextInputType? keyboard, String? hint}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 13, color: _textLight, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          TextField(
            controller: c,
            obscureText: obscure,
            keyboardType: keyboard,
            decoration: InputDecoration(
              hintText: hint,
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              filled: true,
              fillColor: _bg,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(color: _border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(color: _border),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
