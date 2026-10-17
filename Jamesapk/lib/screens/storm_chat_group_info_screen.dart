import 'package:flutter/material.dart';
import '../services/avatar_url.dart';
import 'dart:convert';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/storm_chat_logic.dart';
import 'image_viewer_screen.dart';
import 'video_viewer_screen.dart';
import 'storm_chat_room_screen.dart';
import 'package:url_launcher/url_launcher.dart';

// "Group info" for one Storm Chat (GroupMe-style, PR #102; the web's
// StormChatGroupInfo.tsx). Everyone sees the members, can mute the chat and
// can leave a group; the group's own admins also get its tools (edit, add and
// remove people, make admin, admin-only posting, join requests) and its
// creator can delete it. What is offered comes from the server's `myRights`
// (GET /api/storm-chat/groups/:id), so nothing is shown that the server would
// refuse.
//
// Pops with 'gone' when the person left or deleted the group (the room then
// closes), otherwise with null and the room refreshes the group.
class StormChatGroupInfoScreen extends StatefulWidget {
  final dynamic group;
  final String userId;
  final String userRole;

  const StormChatGroupInfoScreen({
    Key? key,
    required this.group,
    required this.userId,
    required this.userRole,
  }) : super(key: key);

  @override
  State<StormChatGroupInfoScreen> createState() => _StormChatGroupInfoScreenState();
}

class _StormChatGroupInfoScreenState extends State<StormChatGroupInfoScreen> {
  static const _primary = Color(0xFFCB0002);
  static const _textDark = Color(0xFF111827);
  static const _textLight = Color(0xFF6B7280);
  static const _danger = Color(0xFFDC2626);
  static const _base = 'https://millerstorm.tech/api/storm-chat';

  // The group as the server has it now; starts from what the room passed in.
  late Map<String, dynamic> _group = Map<String, dynamic>.from(widget.group as Map);
  Map<String, dynamic>? _rights;
  final Set<String> _myIds = {};
  List<dynamic> _members = [];
  List<dynamic> _requests = [];
  List<dynamic> _mediaMessages = [];
  List<dynamic> _linkMessages = [];
  List<dynamic> _docMessages = [];
  bool _loadingMembers = false;
  bool _loadingMedia = false;
  bool _busy = false;
  int _selectedTab = 0; // 0=media, 1=links, 2=docs

  bool get _isDirect => _group['isDirect'] == true;
  List<String> get _memberIds => ((_group['members'] as List?) ?? []).map((e) => e.toString()).toList();
  Set<String> get _adminIds => ((_group['admins'] as List?) ?? []).map((e) => e.toString()).toSet();
  bool _can(String key) => _rights != null
      ? _rights![key] == true
      : chatRightsFallback(_group, _myIds, widget.userRole)[key] == true;
  bool _isMe(String mongoId) => _myIds.contains(mongoId);

  @override
  void initState() {
    super.initState();
    _myIds.add(widget.userId);
    AuthService.getStoredUser().then((u) {
      if (u == null || !mounted) return;
      setState(() => _myIds.addAll([u['_id'], u['id']].where((e) => e != null).map((e) => e.toString())));
    });
    _load();
    _fetchGroupMedia();
  }

  // ---- loading ----------------------------------------------------------

  Future<void> _load() async {
    try {
      final res = await api.get(Uri.parse('$_base/groups/${_group['_id']}'));
      if (!mounted) return;
      if (res.statusCode == 200) {
        final g = Map<String, dynamic>.from(json.decode(res.body) as Map);
        final dmName = _isDirect ? _group['name'] : null;
        setState(() {
          _group = {..._group, ...g};
          if (dmName != null) {
            _group['isDirect'] = true;
            _group['name'] = dmName;
          }
          _rights = g['myRights'] is Map ? Map<String, dynamic>.from(g['myRights'] as Map) : null;
          final mongoId = (g['myMongoId'] ?? '').toString();
          if (mongoId.isNotEmpty) _myIds.add(mongoId);
        });
        if (_can('canManage') && !_isDirect) _fetchRequests();
      } else if (res.statusCode == 404) {
        _snack('This chat is no longer available.');
        Navigator.pop(context, 'gone');
        return;
      }
    } catch (_) {}
    _fetchMembers();
  }

  Future<void> _fetchMembers() async {
    if (mounted) setState(() => _loadingMembers = true);
    try {
      final ids = _memberIds;
      if (ids.isEmpty) {
        if (mounted) setState(() => _members = []);
        return;
      }
      final response = await api.get(Uri.parse('https://millerstorm.tech/api/users/by-mongo-ids?ids=${ids.join(',')}'));
      if (response.statusCode == 200 && mounted) {
        setState(() => _members = jsonDecode(response.body) as List);
      }
    } catch (e) {
      print('Error fetching members: $e');
    } finally {
      if (mounted) setState(() => _loadingMembers = false);
    }
  }

  Future<void> _fetchRequests() async {
    try {
      final res = await api.get(Uri.parse('$_base/join-requests?groupId=${_group['_id']}'));
      if (res.statusCode == 200 && mounted) setState(() => _requests = json.decode(res.body) as List);
    } catch (_) {}
  }

  // The chat's gallery (PR #105): ?media=photos|files|links, newest first,
  // 60 at a time (?beforeId continues). Each tab loads when first opened.
  static const _galleryKinds = ['photos', 'links', 'files']; // tab 0, 1, 2
  final Map<int, bool> _galleryMore = {};
  final Set<int> _galleryLoaded = {};

  List<dynamic> _galleryItems(int tab) => tab == 0 ? _mediaMessages : tab == 1 ? _linkMessages : _docMessages;

  Future<void> _fetchGroupMedia({int? tab, bool more = false}) async {
    final t = tab ?? _selectedTab;
    final items = _galleryItems(t);
    if (!more && _galleryLoaded.contains(t)) return;
    setState(() => _loadingMedia = true);
    try {
      final q = {'media': _galleryKinds[t], if (more && items.isNotEmpty) 'beforeId': '${items.last['_id']}'};
      final res = await api.get(Uri.parse('$_base/messages/${_group['_id']}').replace(queryParameters: q));
      if (res.statusCode == 200 && mounted) {
        final page = jsonDecode(res.body) as List<dynamic>;
        setState(() {
          _galleryLoaded.add(t);
          items.addAll(page);
          _galleryMore[t] = page.length >= 60;
        });
      }
    } catch (e) {
      print('Error fetching media: $e');
    } finally {
      if (mounted) setState(() => _loadingMedia = false);
    }
  }

  /// The web links in a message, in order, without repeats (like the server's).
  List<String> _linksIn(String text) => RegExp("https?://[^\\s<>\"']+")
      .allMatches(text)
      .map((m) => m.group(0)!.replaceAll(RegExp(r'[.,;:!?)\]]+$'), ''))
      .toSet()
      .toList();

  // ---- actions ------------------------------------------------------------

  void _snack(String text, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(text), backgroundColor: error ? _primary : null),
    );
  }

  String _errorOf(String body, String fallback) {
    try {
      final d = json.decode(body);
      if (d is Map && d['error'] is String) return d['error'];
    } catch (_) {}
    return fallback;
  }

  Future<bool> _confirm(String text, {String yes = 'Yes'}) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        content: Text(text),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(yes, style: const TextStyle(color: _danger, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
    return ok == true;
  }

  // Save a partial change; the server only touches the fields sent. Shows
  // [okText] when it worked (null: the caller says what happened).
  Future<bool> _save(Map<String, dynamic> patch, String? okText) async {
    setState(() => _busy = true);
    try {
      final res = await api.put(
        Uri.parse('$_base/groups/${_group['_id']}'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode(patch),
      );
      if (res.statusCode != 200) {
        _snack(_errorOf(res.body, 'Could not save the change'), error: true);
        return false;
      }
      await _load();
      if (okText != null) _snack(okText);
      return true;
    } catch (_) {
      _snack('Could not save the change', error: true);
      return false;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // Mute for 1 hour / 8 hours / 1 day / until turned back on (PR #105).
  Future<void> _setMute(bool muted) async {
    String choice = 'forever';
    if (muted) {
      final picked = await showModalBottomSheet<String>(
        context: context,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
        builder: (ctx) => SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 16, 16, 4),
                child: Text('Mute notifications', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              ),
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: Text("You'll still get alerts when someone @mentions you.", style: TextStyle(color: _textLight)),
              ),
              for (final c in kMuteChoices)
                ListTile(title: Text(c[1]), onTap: () => Navigator.pop(ctx, c[0])),
            ],
          ),
        ),
      );
      if (picked == null) return;
      choice = picked;
    }
    setState(() => _busy = true);
    try {
      final res = await api.post(
        Uri.parse('$_base/groups/${_group['_id']}/mute'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'muted': muted, if (muted) 'for': choice}),
      );
      if (res.statusCode == 200) {
        String? until;
        try {
          until = (json.decode(res.body) as Map)['mutedUntil'] as String?;
        } catch (_) {}
        setState(() {
          _group['muted'] = muted;
          _group['mutedUntil'] = muted ? until : null;
        });
        _snack(muted
            ? (until != null ? 'Muted until ${centralWhenLabel(until)}' : "Muted. You'll still get @mentions.")
            : 'Unmuted');
      } else {
        _snack("Couldn't change notifications", error: true);
      }
    } catch (_) {
      _snack("Couldn't change notifications", error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _editDetails() async {
    final name = TextEditingController(text: (_group['name'] ?? '').toString());
    final desc = TextEditingController(text: (_group['description'] ?? '').toString());
    final save = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Edit group'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: name, decoration: const InputDecoration(labelText: 'Group name')),
            const SizedBox(height: 8),
            TextField(
              controller: desc,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(labelText: 'Description (optional)'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
        ],
      ),
    );
    if (save != true) return;
    if (name.text.trim().isEmpty) {
      _snack('Name is required', error: true);
      return;
    }
    await _save({'name': name.text.trim(), 'description': desc.text.trim()}, 'Group updated');
  }

  Future<void> _toggleAdmin(Map member) async {
    final id = member['_id'].toString();
    final wasAdmin = _adminIds.contains(id);
    final next = wasAdmin ? (_adminIds..remove(id)).toList() : [..._adminIds, id];
    final name = (member['name'] ?? 'They').toString();
    if (!await _save({'admins': next}, null)) return;
    // While group admins are switched off on the server, it quietly keeps the
    // old admin list: say so instead of claiming it worked.
    if (!wasAdmin && !_adminIds.contains(id)) {
      _snack("Group admins aren't switched on yet, so $name wasn't made admin.", error: true);
    } else {
      _snack(wasAdmin ? '$name is no longer an admin' : '$name is now an admin');
    }
  }

  Future<void> _removeMember(Map member) async {
    final name = (member['name'] ?? 'this person').toString();
    if (!await _confirm('Remove $name from this group?', yes: 'Remove')) return;
    final id = member['_id'].toString();
    await _save({'members': _memberIds.where((m) => m != id).toList()}, '$name was removed');
  }

  Future<void> _decide(Map request, bool approve) async {
    setState(() => _busy = true);
    try {
      final res = await api.patch(
        Uri.parse('$_base/join-requests'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'requestId': request['_id'], 'action': approve ? 'approve' : 'deny'}),
      );
      if (res.statusCode == 200) {
        _snack(approve ? '${request['userName'] ?? 'They'} joined the group' : 'Request declined');
        await _load();
      } else {
        _snack(_errorOf(res.body, 'Could not update the request'), error: true);
      }
    } catch (_) {
      _snack('Could not update the request', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // Leave the group. The last admin must first hand over to someone (the
  // server answers 409 needsNewAdmin), so the group is never left unrun.
  Future<void> _leave({String? newAdminId}) async {
    if (newAdminId == null &&
        !await _confirm("Leave this group? You'll stop getting its messages.", yes: 'Leave')) {
      return;
    }
    setState(() => _busy = true);
    try {
      final res = await api.post(
        Uri.parse('$_base/groups/${_group['_id']}/leave'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode(newAdminId != null ? {'newAdminId': newAdminId} : {}),
      );
      Map data = {};
      try {
        data = json.decode(res.body) as Map;
      } catch (_) {}
      if (res.statusCode == 409 && data['needsNewAdmin'] == true) {
        if (mounted) setState(() => _busy = false);
        final pick = await _pickNewAdmin();
        if (pick != null) await _leave(newAdminId: pick);
        return;
      }
      if (res.statusCode != 200) {
        _snack(_errorOf(res.body, 'Could not leave the group'), error: true);
        return;
      }
      _snack('You left the group');
      if (mounted) Navigator.pop(context, 'gone');
    } catch (_) {
      _snack('Could not leave the group', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<String?> _pickNewAdmin() {
    final candidates = _members.where((m) => !_adminIds.contains(m['_id'].toString()) && !_isMe(m['_id'].toString())).toList();
    return showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (ctx) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.7),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: Text("You're the last admin. Pick someone to take over before you leave:",
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
              ),
              Flexible(
                child: ListView(
                  shrinkWrap: true,
                  children: [
                    for (final m in candidates)
                      ListTile(
                        leading: _avatar(m),
                        title: Text((m['name'] ?? 'Unknown').toString()),
                        trailing: const Text('Make admin and leave', style: TextStyle(color: _primary, fontSize: 12, fontWeight: FontWeight.w700)),
                        onTap: () => Navigator.pop(ctx, m['_id'].toString()),
                      ),
                  ],
                ),
              ),
              TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _deleteGroup() async {
    final subs = (_group['subgroupCount'] is num) ? (_group['subgroupCount'] as num).toInt() : 0;
    final extra = subs > 0 ? ' and its $subs ${subs == 1 ? 'subgroup' : 'subgroups'}' : '';
    if (!await _confirm('Delete "${_group['name']}"$extra for everyone, with all its messages? This can\'t be undone.',
        yes: 'Delete')) {
      return;
    }
    setState(() => _busy = true);
    try {
      final res = await api.delete(Uri.parse('$_base/groups/${_group['_id']}'));
      if (res.statusCode != 200) {
        _snack(_errorOf(res.body, 'Could not delete the group'), error: true);
        return;
      }
      _snack('Group deleted');
      if (mounted) Navigator.pop(context, 'gone');
    } catch (_) {
      _snack('Could not delete the group', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _addMembers() async {
    List<dynamic> directory = [];
    try {
      final res = await api.get(Uri.parse('https://millerstorm.tech/api/users/directory'));
      if (res.statusCode == 200) directory = json.decode(res.body) as List;
    } catch (_) {}
    if (!mounted) return;
    String search = '';
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) {
          final inGroup = _memberIds.toSet();
          final addable = directory
              .where((p) => !inGroup.contains(p['_id'].toString()))
              .where((p) => (p['name'] ?? '').toString().toLowerCase().contains(search.trim().toLowerCase()))
              .take(50)
              .toList();
          return Padding(
            padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
            child: SafeArea(
              child: SizedBox(
                height: MediaQuery.of(ctx).size.height * 0.7,
                child: Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                      child: TextField(
                        autofocus: true,
                        decoration: const InputDecoration(
                          hintText: 'Search people',
                          prefixIcon: Icon(Icons.search),
                          isDense: true,
                          border: OutlineInputBorder(),
                        ),
                        onChanged: (v) => setSheet(() => search = v),
                      ),
                    ),
                    Expanded(
                      child: addable.isEmpty
                          ? const Center(child: Text('No one to add', style: TextStyle(color: _textLight)))
                          : ListView.builder(
                              itemCount: addable.length,
                              itemBuilder: (_, i) {
                                final p = addable[i];
                                return ListTile(
                                  leading: _avatar(p),
                                  title: Text((p['name'] ?? 'Unknown').toString()),
                                  trailing: TextButton(
                                    onPressed: _busy
                                        ? null
                                        : () async {
                                            await _save({'members': [..._memberIds, p['_id'].toString()]}, '${p['name']} was added');
                                            setSheet(() {});
                                          },
                                    child: const Text('Add'),
                                  ),
                                );
                              },
                            ),
                    ),
                    TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Done')),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  // Option 1: open (or create) a 1-on-1 private DM with a group member.
  Future<void> _messagePrivately(dynamic member) async {
    final targetId = (member['_id'] ?? member['id'])?.toString() ?? '';
    if (targetId.isEmpty) return;
    try {
      final res = await api.post(
        Uri.parse('$_base/dm'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'userId': targetId}),
      );
      if (res.statusCode == 200) {
        final dm = json.decode(res.body);
        final other = dm['dmOther'] as Map<String, dynamic>?;
        final name = (other?['name'] ?? member['name'] ?? 'Direct message').toString();
        final g = Map<String, dynamic>.from(dm as Map);
        g['name'] = name;
        g['isDirect'] = true;
        if (!mounted) return;
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => StormChatRoomScreen(group: g, userId: widget.userId, userRole: widget.userRole),
          ),
        );
      } else {
        _snack('Could not open the conversation');
      }
    } catch (e) {
      _snack('Could not open the conversation');
    }
  }

  // ---- layout -----------------------------------------------------------

  Widget _avatar(dynamic person, {double radius = 20}) {
    final name = (person['name'] ?? '?').toString();
    final headshotUrl = (person['headshotUrl'] ?? '').toString();
    return CircleAvatar(
      radius: radius,
      backgroundColor: const Color(0xFFF3F4F6),
      backgroundImage: headshotUrl.isNotEmpty ? avatarProvider('https://millerstorm.tech$headshotUrl') : null,
      child: headshotUrl.isEmpty
          ? Text(name.isNotEmpty ? name[0].toUpperCase() : '?',
              style: const TextStyle(color: _textLight, fontWeight: FontWeight.w600))
          : null,
    );
  }

  Widget _card({required Widget child}) => Container(
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: child,
      );

  Widget _label(String text, {Widget? trailing}) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 8, 4),
        child: Row(
          children: [
            Expanded(
              child: Text(text.toUpperCase(),
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _textLight, letterSpacing: 0.4)),
            ),
            if (trailing != null) trailing,
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final memberCount = _memberIds.isNotEmpty ? _memberIds.length : ((_group['memberCount'] as num?)?.toInt() ?? 0);
    final imageUrl = (_group['imageUrl'] ?? '').toString();
    final description = (_group['description'] ?? '').toString();
    final canManage = _can('canManage') && !_isDirect;
    final admins = _adminIds;
    final byId = {for (final m in _members) m['_id'].toString(): m};
    final sortedMembers = _memberIds.map((id) => byId[id] ?? {'_id': id, 'name': 'Former user'}).toList()
      ..sort((a, b) {
        final adminOrder = (admins.contains(b['_id'].toString()) ? 1 : 0) - (admins.contains(a['_id'].toString()) ? 1 : 0);
        return adminOrder != 0 ? adminOrder : (a['name'] ?? '').toString().compareTo((b['name'] ?? '').toString());
      });

    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F5),
      appBar: AppBar(
        backgroundColor: _primary,
        elevation: 0,
        title: Text(_isDirect ? 'Chat info' : 'Group info',
            style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: SingleChildScrollView(
        child: Column(
          children: [
            // Header
            Container(
              width: double.infinity,
              color: _primary,
              padding: const EdgeInsets.only(bottom: 24),
              child: Column(
                children: [
                  Container(
                    width: 100,
                    height: 100,
                    decoration: BoxDecoration(
                      color: Colors.black,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 3),
                      image: imageUrl.isNotEmpty
                          ? DecorationImage(image: NetworkImage('https://millerstorm.tech$imageUrl'), fit: BoxFit.cover)
                          : null,
                    ),
                    child: imageUrl.isEmpty ? const Center(child: Text('👥', style: TextStyle(fontSize: 40))) : null,
                  ),
                  const SizedBox(height: 16),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Text(
                      (_group['name'] ?? 'Group').toString(),
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold),
                    ),
                  ),
                  if (description.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 8, left: 32, right: 32),
                      child: Text(description,
                          style: const TextStyle(color: Colors.white70, fontSize: 14), textAlign: TextAlign.center),
                    ),
                  if (!_isDirect)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        '$memberCount ${memberCount == 1 ? 'member' : 'members'}${_group['onlyAdminCanChat'] == true ? ' · Only admins can post' : ''}',
                        style: const TextStyle(color: Colors.white70, fontSize: 13),
                      ),
                    ),
                  if (canManage)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: OutlinedButton.icon(
                        onPressed: _busy ? null : _editDetails,
                        icon: const Icon(Icons.edit, size: 16, color: Colors.white),
                        label: const Text('Edit name and description', style: TextStyle(color: Colors.white)),
                        style: OutlinedButton.styleFrom(side: const BorderSide(color: Colors.white70)),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Notifications: anyone in the chat, DMs included.
            if (_can('isMember'))
              _card(
                child: SwitchListTile(
                  value: _group['muted'] == true,
                  activeColor: _primary,
                  onChanged: _busy ? null : _setMute,
                  title: Text(_isDirect ? 'Mute this chat' : 'Mute this group'),
                  subtitle: Text(_group['muted'] == true
                      ? '${_group['mutedUntil'] != null ? 'Muted until ${centralWhenLabel('${_group['mutedUntil']}')}' : 'Muted until you turn it back on'}. @mentions still come through.'
                      : "You'll still get alerts when someone @mentions you."),
                ),
              ),

            // Settings: the group's admins.
            if (canManage)
              _card(
                child: SwitchListTile(
                  value: _group['onlyAdminCanChat'] == true,
                  activeColor: _primary,
                  onChanged: _busy
                      ? null
                      : (v) => _save({'onlyAdminCanChat': v}, v ? 'Only admins can post now' : 'Everyone can post now'),
                  title: const Text('Only admins can post'),
                  subtitle: const Text('Members can still read the chat.'),
                ),
              ),

            // Requests to join a private group.
            if (canManage && _requests.isNotEmpty)
              _card(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _label('Requests to join (${_requests.length})'),
                    for (final r in _requests)
                      ListTile(
                        title: Text((r['userName'] ?? 'Someone').toString()),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            TextButton(onPressed: _busy ? null : () => _decide(r, false), child: const Text('Decline')),
                            ElevatedButton(
                              onPressed: _busy ? null : () => _decide(r, true),
                              style: ElevatedButton.styleFrom(backgroundColor: _primary, foregroundColor: Colors.white),
                              child: const Text('Approve'),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),

            // Members
            if (!_isDirect)
              _card(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _label(
                      'Members ($memberCount)',
                      trailing: canManage
                          ? TextButton.icon(
                              onPressed: _busy ? null : _addMembers,
                              icon: const Icon(Icons.person_add_alt, size: 18, color: _primary),
                              label: const Text('Add', style: TextStyle(color: _primary)),
                            )
                          : null,
                    ),
                    if (_loadingMembers && _members.isEmpty)
                      const Padding(
                        padding: EdgeInsets.all(20),
                        child: Center(child: CircularProgressIndicator(color: _primary)),
                      )
                    else
                      for (final m in sortedMembers) _memberRow(m, admins, canManage),
                    const SizedBox(height: 6),
                  ],
                ),
              ),

            // Media, Links, Docs
            _card(
              child: Column(
                children: [
                  Row(
                    children: [
                      _mediaTab(0, 'Media', Icons.photo_library),
                      _mediaTab(1, 'Links', Icons.link),
                      _mediaTab(2, 'Docs', Icons.insert_drive_file),
                    ],
                  ),
                  const Divider(height: 1),
                  _loadingMedia && _galleryItems(_selectedTab).isEmpty
                      ? const Padding(
                          padding: EdgeInsets.all(24),
                          child: Center(child: CircularProgressIndicator(color: _primary)),
                        )
                      : _buildMediaContent(),
                  _galleryFooter(),
                ],
              ),
            ),

            // Leave / delete
            if (_can('canLeave') || _can('canDelete'))
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (_can('canLeave'))
                      OutlinedButton.icon(
                        onPressed: _busy ? null : () => _leave(),
                        icon: const Icon(Icons.logout, color: _danger),
                        label: const Text('Leave group', style: TextStyle(color: _danger, fontWeight: FontWeight.w700)),
                        style: OutlinedButton.styleFrom(side: const BorderSide(color: _danger), padding: const EdgeInsets.all(12)),
                      ),
                    if (_can('canDelete')) ...[
                      const SizedBox(height: 10),
                      OutlinedButton.icon(
                        onPressed: _busy ? null : _deleteGroup,
                        icon: const Icon(Icons.delete_forever, color: _danger),
                        label: const Text('Delete group for everyone', style: TextStyle(color: _danger, fontWeight: FontWeight.w700)),
                        style: OutlinedButton.styleFrom(side: const BorderSide(color: _danger), padding: const EdgeInsets.all(12)),
                      ),
                    ],
                  ],
                ),
              )
            else
              const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  Widget _memberRow(Map member, Set<String> admins, bool canManage) {
    final id = member['_id'].toString();
    final name = (member['name'] ?? 'Unknown').toString();
    final isAdmin = admins.contains(id);
    final me = _isMe(id);
    return ListTile(
      leading: _avatar(member),
      title: Text(me ? '$name (you)' : name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: _textDark)),
      subtitle: isAdmin
          ? const Text('Admin', style: TextStyle(fontSize: 12, color: _primary, fontWeight: FontWeight.w600))
          : null,
      trailing: me
          ? null
          : Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(
                  icon: const Icon(Icons.chat_bubble_outline, size: 20, color: _primary),
                  tooltip: 'Message privately',
                  onPressed: () => _messagePrivately(member),
                ),
                // Your own row has no Remove / Remove admin: use Leave, which
                // makes the last admin hand over first.
                if (canManage)
                  PopupMenuButton<String>(
                    tooltip: 'Manage $name',
                    enabled: !_busy,
                    onSelected: (v) => v == 'admin' ? _toggleAdmin(member) : _removeMember(member),
                    itemBuilder: (_) => [
                      PopupMenuItem(value: 'admin', child: Text(isAdmin ? 'Remove admin' : 'Make admin')),
                      const PopupMenuItem(value: 'remove', child: Text('Remove from group', style: TextStyle(color: _danger))),
                    ],
                  ),
              ],
            ),
    );
  }

  Widget _mediaTab(int index, String label, IconData icon) {
    final isSelected = _selectedTab == index;
    return Expanded(
      child: InkWell(
        onTap: () {
          setState(() => _selectedTab = index);
          _fetchGroupMedia(tab: index);
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: isSelected ? _primary : Colors.transparent, width: 2)),
          ),
          child: Column(
            children: [
              Icon(icon, color: isSelected ? _primary : _textLight, size: 20),
              const SizedBox(height: 4),
              Text(label,
                  style: TextStyle(
                      fontSize: 12,
                      color: isSelected ? _primary : _textLight,
                      fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMediaContent() {
    if (_selectedTab == 0) {
      if (_mediaMessages.isEmpty) return _emptyState('No media shared yet');
      return GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.all(8),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, crossAxisSpacing: 4, mainAxisSpacing: 4),
        itemCount: _mediaMessages.length,
        itemBuilder: (context, index) {
          final msg = _mediaMessages[index];
          final url = msg['mediaUrl'].toString().startsWith('http') ? msg['mediaUrl'] : 'https://millerstorm.tech${msg['mediaUrl']}';
          final isVideo = msg['messageType'] == 'video';
          return GestureDetector(
            onTap: () {
              if (isVideo) {
                Navigator.push(context, MaterialPageRoute(builder: (_) => VideoViewerScreen(videoUrl: msg['mediaUrl'])));
              } else {
                Navigator.push(context, MaterialPageRoute(builder: (_) => ImageViewerScreen(imageUrl: url)));
              }
            },
            child: Stack(
              fit: StackFit.expand,
              children: [
                Image.network(url,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) =>
                        Container(color: Colors.grey[300], child: const Icon(Icons.broken_image, color: Colors.grey))),
                if (isVideo) const Center(child: Icon(Icons.play_circle_fill, color: Colors.white, size: 32)),
              ],
            ),
          );
        },
      );
    } else if (_selectedTab == 1) {
      if (_linkMessages.isEmpty) return _emptyState('No links shared yet');
      // A message can hold several links; each gets its own row.
      final rows = [
        for (final msg in _linkMessages)
          for (final url in _linksIn('${msg['message'] ?? ''}')) {'url': url, 'by': '${msg['senderName'] ?? ''}'},
      ];
      return ListView.separated(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: rows.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (context, index) {
          final url = rows[index]['url']!;
          return ListTile(
            leading: const Icon(Icons.link, color: _primary),
            title: Text(url, style: const TextStyle(fontSize: 13, color: Colors.blue), maxLines: 2, overflow: TextOverflow.ellipsis),
            subtitle: Text(rows[index]['by']!, style: const TextStyle(fontSize: 11)),
            onTap: () async {
              final uri = Uri.parse(url);
              if (await canLaunchUrl(uri)) launchUrl(uri, mode: LaunchMode.externalApplication);
            },
          );
        },
      );
    } else {
      if (_docMessages.isEmpty) return _emptyState('No documents shared yet');
      return ListView.separated(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: _docMessages.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (context, index) {
          final msg = _docMessages[index];
          final raw = '${msg['mediaUrl'] ?? ''}';
          return ListTile(
            leading: const Icon(Icons.insert_drive_file, color: _primary),
            title: Text('${msg['message'] ?? 'Document'}', style: const TextStyle(fontSize: 13)),
            subtitle: Text('${msg['senderName'] ?? ''}', style: const TextStyle(fontSize: 11)),
            onTap: raw.isEmpty
                ? null
                : () => launchUrl(Uri.parse(raw.startsWith('http') ? raw : 'https://millerstorm.tech$raw'),
                    mode: LaunchMode.externalApplication),
          );
        },
      );
    }
  }

  // More of the open tab, when the server said there's more.
  Widget _galleryFooter() => _galleryMore[_selectedTab] == true
      ? TextButton(
          onPressed: _loadingMedia ? null : () => _fetchGroupMedia(more: true),
          child: const Text('Load more', style: TextStyle(color: _primary)),
        )
      : const SizedBox.shrink();

  Widget _emptyState(String text) {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Center(child: Text(text, style: const TextStyle(color: Colors.grey, fontSize: 14))),
    );
  }
}
