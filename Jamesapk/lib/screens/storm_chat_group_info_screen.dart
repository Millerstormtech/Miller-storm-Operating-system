import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'image_viewer_screen.dart';
import 'video_viewer_screen.dart';
import 'package:url_launcher/url_launcher.dart';

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
  static const _border = Color(0xFFE5E7EB);

  List<dynamic> _members = [];
  List<dynamic> _mediaMessages = [];
  List<dynamic> _linkMessages = [];
  List<dynamic> _docMessages = [];
  bool _loadingMembers = false;
  bool _loadingMedia = false;
  int _selectedTab = 0; // 0=media, 1=links, 2=docs

  @override
  void initState() {
    super.initState();
    _fetchMembers();
    _fetchGroupMedia();
  }

  Future<void> _fetchMembers() async {
    setState(() => _loadingMembers = true);
    try {
      final members = List<String>.from(widget.group['members'] ?? []);
      if (members.isEmpty) { setState(() => _loadingMembers = false); return; }
      final memberIds = members.join(',');
      final response = await http.get(
        Uri.parse('https://millerstorm.tech/api/users/by-mongo-ids?ids=$memberIds'),
      );
      if (response.statusCode == 200) {
        setState(() { _members = jsonDecode(response.body); });
      }
    } catch (e) {
      print('Error fetching members: $e');
    } finally {
      setState(() => _loadingMembers = false);
    }
  }

  Future<void> _fetchGroupMedia() async {
    setState(() => _loadingMedia = true);
    try {
      final response = await http.get(
        Uri.parse('https://millerstorm.tech/api/storm-chat/messages/${widget.group['_id']}?userId=${widget.userId}&userRole=${widget.userRole}'),
      );
      if (response.statusCode == 200) {
        final messages = jsonDecode(response.body) as List<dynamic>;
        final media = messages.where((m) => m['messageType'] == 'image' || m['messageType'] == 'video').toList();
        final links = messages.where((m) {
          if (m['messageType'] != 'text') return false;
          final text = m['message']?.toString() ?? '';
          return RegExp(r'https?://[^\s]+').hasMatch(text);
        }).toList();
        final docs = messages.where((m) => m['messageType'] == 'document').toList();
        setState(() {
          _mediaMessages = media;
          _linkMessages = links;
          _docMessages = docs;
        });
      }
    } catch (e) {
      print('Error fetching media: $e');
    } finally {
      setState(() => _loadingMedia = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F5),
      appBar: AppBar(
        backgroundColor: _primary,
        elevation: 0,
        title: const Text('Group Info', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600)),
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
              padding: const EdgeInsets.only(bottom: 32),
              child: Column(
                children: [
                  Container(
                    width: 100,
                    height: 100,
                    decoration: BoxDecoration(
                      color: Colors.black,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 3),
                      image: widget.group['imageUrl'] != null && widget.group['imageUrl'].isNotEmpty
                          ? DecorationImage(
                              image: NetworkImage('https://millerstorm.tech${widget.group['imageUrl']}'),
                              fit: BoxFit.cover,
                            )
                          : null,
                    ),
                    child: widget.group['imageUrl'] == null || widget.group['imageUrl'].isEmpty
                        ? const Center(child: Text('👥', style: TextStyle(fontSize: 40)))
                        : null,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    widget.group['name'] ?? 'Group',
                    style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold),
                  ),
                  if (widget.group['description'] != null && widget.group['description'].isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 8, left: 32, right: 32),
                      child: Text(
                        widget.group['description'],
                        style: const TextStyle(color: Colors.white70, fontSize: 14),
                        textAlign: TextAlign.center,
                      ),
                    ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Stats — Members clickable, Open Chat removed
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8, offset: const Offset(0, 2))],
              ),
              child: Row(
                children: [
                  // Members - clickable
                  Expanded(
                    child: InkWell(
                      borderRadius: const BorderRadius.only(topLeft: Radius.circular(12), bottomLeft: Radius.circular(12)),
                      onTap: () => _showMembersSheet(),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 20),
                        child: Column(
                          children: [
                            Text(
                              '${(widget.group['members'] as List?)?.length ?? 0}',
                              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: _primary),
                            ),
                            const Text('Members', style: TextStyle(fontSize: 12, color: Colors.grey)),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Container(width: 1, height: 40, color: Colors.grey[300]),
                  // Admins
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 20),
                      child: Column(
                        children: [
                          Text(
                            '${(widget.group['admins'] as List?)?.length ?? 0}',
                            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: _primary),
                          ),
                          const Text('Admins', style: TextStyle(fontSize: 12, color: Colors.grey)),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Media, Links, Docs
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8, offset: const Offset(0, 2))],
              ),
              child: Column(
                children: [
                  // Tab header
                  Row(
                    children: [
                      _mediaTab(0, 'Media', Icons.photo_library),
                      _mediaTab(1, 'Links', Icons.link),
                      _mediaTab(2, 'Docs', Icons.insert_drive_file),
                    ],
                  ),
                  const Divider(height: 1),
                  // Tab content
                  _loadingMedia
                      ? const Padding(
                          padding: EdgeInsets.all(24),
                          child: Center(child: CircularProgressIndicator(color: _primary)),
                        )
                      : _buildMediaContent(),
                ],
              ),
            ),

            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Widget _mediaTab(int index, String label, IconData icon) {
    final isSelected = _selectedTab == index;
    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _selectedTab = index),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: isSelected ? _primary : Colors.transparent, width: 2)),
          ),
          child: Column(
            children: [
              Icon(icon, color: isSelected ? _primary : _textLight, size: 20),
              const SizedBox(height: 4),
              Text(label, style: TextStyle(fontSize: 12, color: isSelected ? _primary : _textLight, fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal)),
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
                Image.network(url, fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(color: Colors.grey[300], child: const Icon(Icons.broken_image, color: Colors.grey)),
                ),
                if (isVideo)
                  const Center(child: Icon(Icons.play_circle_fill, color: Colors.white, size: 32)),
              ],
            ),
          );
        },
      );
    } else if (_selectedTab == 1) {
      if (_linkMessages.isEmpty) return _emptyState('No links shared yet');
      return ListView.separated(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: _linkMessages.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (context, index) {
          final msg = _linkMessages[index];
          final text = msg['message']?.toString() ?? '';
          final urlMatch = RegExp(r'https?://[^\s]+').firstMatch(text);
          final url = urlMatch?.group(0) ?? '';
          return ListTile(
            leading: const Icon(Icons.link, color: _primary),
            title: Text(url, style: const TextStyle(fontSize: 13, color: Colors.blue), maxLines: 1, overflow: TextOverflow.ellipsis),
            subtitle: Text(msg['senderName'] ?? '', style: const TextStyle(fontSize: 11)),
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
          return ListTile(
            leading: const Icon(Icons.insert_drive_file, color: _primary),
            title: Text(msg['message'] ?? 'Document', style: const TextStyle(fontSize: 13)),
            subtitle: Text(msg['senderName'] ?? '', style: const TextStyle(fontSize: 11)),
          );
        },
      );
    }
  }

  Widget _emptyState(String text) {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Center(child: Text(text, style: const TextStyle(color: Colors.grey, fontSize: 14))),
    );
  }

  void _showMembersSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.7,
        maxChildSize: 0.95,
        minChildSize: 0.4,
        expand: false,
        builder: (context, scrollController) => Column(
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  const Text('Members', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                  const Spacer(),
                  Text('${_members.length}', style: const TextStyle(color: _textLight)),
                ],
              ),
            ),
            const Divider(height: 1),
            _loadingMembers
                ? const Expanded(child: Center(child: CircularProgressIndicator(color: _primary)))
                : Expanded(
                    child: ListView.builder(
                      controller: scrollController,
                      itemCount: _members.length,
                      itemBuilder: (context, index) {
                        final member = _members[index];
                        final name = member['name'] ?? 'Unknown';
                        final headshotUrl = member['headshotUrl'] ?? '';
                        final role = member['role'] ?? '';
                        final isAdmin = (widget.group['admins'] as List?)?.contains(member['_id']) == true;
                        return ListTile(
                          leading: CircleAvatar(
                            radius: 22,
                            backgroundColor: const Color(0xFFF3F4F6),
                            backgroundImage: headshotUrl.isNotEmpty
                                ? NetworkImage('https://millerstorm.tech$headshotUrl')
                                : null,
                            child: headshotUrl.isEmpty
                                ? Text(name[0].toUpperCase(), style: const TextStyle(color: _textLight, fontWeight: FontWeight.w600))
                                : null,
                          ),
                          title: Text(name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                          subtitle: Text(role, style: const TextStyle(fontSize: 12, color: _textLight)),
                          trailing: isAdmin
                              ? Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  decoration: BoxDecoration(color: _primary.withOpacity(0.1), borderRadius: BorderRadius.circular(4)),
                                  child: const Text('Admin', style: TextStyle(fontSize: 11, color: _primary, fontWeight: FontWeight.w600)),
                                )
                              : null,
                        );
                      },
                    ),
                  ),
          ],
        ),
      ),
    );
  }
}
