import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/services.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../services/api_client.dart';
import 'dart:async';
import 'package:image_picker/image_picker.dart';
import 'package:video_compress/video_compress.dart';
import 'dart:io';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/auth_service.dart';
import 'storm_chat_group_info_screen.dart';
import 'image_viewer_screen.dart';
import 'video_viewer_screen.dart';
import 'package:url_launcher/url_launcher.dart';
import 'dart:typed_data';
import 'package:path_provider/path_provider.dart';
import 'package:image_editor_plus/image_editor_plus.dart';

class StormChatRoomScreen extends StatefulWidget {
  final dynamic group;
  final String userId;
  final String userRole;

  const StormChatRoomScreen({
    Key? key,
    required this.group,
    required this.userId,
    required this.userRole,
  }) : super(key: key);

  @override
  _StormChatRoomScreenState createState() => _StormChatRoomScreenState();
}

class _StormChatRoomScreenState extends State<StormChatRoomScreen> {
  List<dynamic> messages = [];
  final TextEditingController _messageController = TextEditingController();
  final FocusNode _messageFocusNode = FocusNode();
  final ScrollController _scrollController = ScrollController();
  bool isLoading = true;
  bool isSending = false;
  bool isUploading = false;
  Timer? _pollTimer;
  String? userName;
  // The server stores message senderId as the app `id`, while widget.userId is
  // the Mongo `_id`. Collect both so "is this my message?" matches either form.
  final Set<String> _myIds = {};
  dynamic replyingTo; // Store the message being replied to
  String? _blinkingMessageId; // Track which message is blinking
  Timer? _blinkTimer;
  bool _isDarkTheme = false; // Theme toggle state
  bool _showScrollToBottomButton = false;
  bool _hasNewMessages = false;
  dynamic _longPressedMessage;
  String? _emojiTrayMessageId;
  
  // Mention feature
  bool _showMentionList = false;
  List<dynamic> _filteredMembers = [];
  List<dynamic> _allMembers = [];
  int _mentionStartIndex = -1;
  String _mentionQuery = '';
  bool _loadingMembers = true;

  bool get canSendMessage {
    final onlyAdminCanChat = widget.group['onlyAdminCanChat'] ?? false;
    final members = List<String>.from(widget.group['members'] ?? []);
    final admins = List<String>.from(widget.group['admins'] ?? []);
    
    final isAdmin = widget.userRole == 'admin';
    final isGroupAdmin = admins.contains(widget.userId);
    final isGroupMember = members.contains(widget.userId);
    
    // If "Only admins can send messages" is checked, only system admins can send
    if (onlyAdminCanChat) {
      return isAdmin;
    }
    
    // If group admins are assigned, only group admins can send
    if (admins.isNotEmpty) {
      return isAdmin || isGroupAdmin;
    }
    
    // If no restrictions, all members can send
    return isAdmin || isGroupMember;
  }

  @override
  void initState() {
    super.initState();
    _loadUserName();
    _fetchMessages();
    _startPolling();
    _markAsRead();
    _fetchGroupMembers(); // Fetch members immediately on screen load
    _messageController.addListener(_onMessageTextChanged);
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _blinkTimer?.cancel();
    _messageController.removeListener(_onMessageTextChanged);
    _messageFocusNode.dispose();
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    _markAsRead(); // Mark as read when leaving chat
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.hasClients) {
      final maxScroll = _scrollController.position.maxScrollExtent;
      final currentScroll = _scrollController.position.pixels;
      final isAtBottom = (maxScroll - currentScroll) < 100;
      
      setState(() {
        _showScrollToBottomButton = !isAtBottom;
        if (isAtBottom) {
          _hasNewMessages = false;
        }
      });
    }
  }



  void _scrollToBottom() {
    if (_scrollController.hasClients) {
      setState(() {
        _hasNewMessages = false;
        _showScrollToBottomButton = false;
      });
      Future.delayed(const Duration(milliseconds: 100), () {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      });
    }
  }



  Future<void> _loadUserName() async {
    final user = await AuthService.getStoredUser();
    if (user != null) {
      setState(() {
        userName = user['name'];
        _myIds
          ..clear()
          ..add(widget.userId)
          ..addAll([user['_id'], user['id']]
              .where((e) => e != null)
              .map((e) => e.toString()));
      });
      print('🔵 User loaded - Name: $userName, ids: $_myIds');
    }
  }

  /// True when [message] was sent by the current user. The server stores
  /// senderId as the app `id`, so match against every id form we hold.
  bool _isMine(dynamic message) =>
      _myIds.contains(message['senderId']?.toString());

  Future<void> _fetchGroupMembers() async {
    setState(() {
      _loadingMembers = true;
    });
    
    try {
      final members = List<String>.from(widget.group['members'] ?? []);
      
      if (members.isEmpty) {
        setState(() {
          _allMembers = [];
          _loadingMembers = false;
        });
        return;
      }
      
      // Fetch all members in a single API call
      final memberIds = members.join(',');
      final response = await api.get(
        Uri.parse('https://millerstorm.tech/api/users/by-mongo-ids?ids=$memberIds'),
      );
      
      if (response.statusCode == 200) {
        final memberDetails = json.decode(response.body) as List;
        
        setState(() {
          _allMembers = memberDetails;
          _loadingMembers = false;
          // Update filtered members if mention list is showing
          if (_showMentionList) {
            _filteredMembers = _mentionQuery.isEmpty 
                ? List.from(_allMembers)
                : _allMembers.where((member) {
                    final name = (member['name'] ?? '').toLowerCase();
                    return name.contains(_mentionQuery);
                  }).toList();
          }
        });
      } else {
        setState(() {
          _loadingMembers = false;
        });
      }
    } catch (e) {
      print('❌ Error fetching group members: $e');
      setState(() {
        _loadingMembers = false;
      });
    }
  }

  void _onMessageTextChanged() {
    final text = _messageController.text;
    final cursorPosition = _messageController.selection.baseOffset;
    
    if (cursorPosition < 0 || text.isEmpty) {
      setState(() {
        _showMentionList = false;
        _filteredMembers = [];
      });
      return;
    }
    
    if (!text.contains('@')) {
      setState(() {
        _showMentionList = false;
        _filteredMembers = [];
      });
      return;
    }
    
    // Find the last @ before cursor
    int lastAtIndex = -1;
    for (int i = cursorPosition - 1; i >= 0; i--) {
      if (text[i] == '@') {
        lastAtIndex = i;
        break;
      }
      if (text[i] == ' ' || text[i] == '\n') {
        break;
      }
    }
    
    if (lastAtIndex != -1) {
      final query = text.substring(lastAtIndex + 1, cursorPosition).toLowerCase().trim();
      
      // Filter members - if query is empty, show all members
      final filtered = query.isEmpty 
          ? List.from(_allMembers)
          : _allMembers.where((member) {
              final name = (member['name'] ?? '').toLowerCase();
              return name.contains(query);
            }).toList();
      
      setState(() {
        _showMentionList = true;
        _mentionStartIndex = lastAtIndex;
        _mentionQuery = query;
        _filteredMembers = filtered;
      });
    } else {
      setState(() {
        _showMentionList = false;
        _mentionStartIndex = -1;
        _mentionQuery = '';
        _filteredMembers = [];
      });
    }
  }

  // Build styled text with red @ mentions
  TextSpan _buildStyledText(String text) {
    final List<TextSpan> spans = [];
    final RegExp mentionRegExp = RegExp(r'@\w+');
    int start = 0;
    final textColor = _isDarkTheme ? Colors.white : const Color(0xFF111827);

    for (final Match match in mentionRegExp.allMatches(text)) {
      // Add text before the mention
      if (match.start > start) {
        spans.add(TextSpan(
          text: text.substring(start, match.start),
          style: TextStyle(color: textColor, fontSize: 16),
        ));
      }

      // Add the mention in red
      spans.add(TextSpan(
        text: match.group(0),
        style: const TextStyle(
          color: Color(0xFFCB0002),
          fontSize: 16,
          fontWeight: FontWeight.w600,
        ),
      ));

      start = match.end;
    }

    // Add remaining text
    if (start < text.length) {
      spans.add(TextSpan(
        text: text.substring(start),
        style: TextStyle(color: textColor, fontSize: 16),
      ));
    }

    return TextSpan(children: spans);
  }

  void _insertMention(String name) {
    final text = _messageController.text;
    final cursorPosition = _messageController.selection.baseOffset;
    
    // Replace from @ to cursor with the mention
    final beforeMention = text.substring(0, _mentionStartIndex);
    final afterMention = text.substring(cursorPosition);
    final newText = '$beforeMention@$name $afterMention';
    
    _messageController.text = newText;
    _messageController.selection = TextSelection.fromPosition(
      TextPosition(offset: beforeMention.length + name.length + 2),
    );
    
    setState(() {
      _showMentionList = false;
      _mentionStartIndex = -1;
      _mentionQuery = '';
      _filteredMembers = [];
    });
  }

  void _startPolling() {
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (timer) {
      _fetchMessages(silent: true);
    });
  }

  Future<void> _markAsRead() async {
    try {
      await api.post(
        Uri.parse('https://millerstorm.tech/api/storm-chat/mark-read'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'userId': widget.userId,
          'groupId': widget.group['_id'],
        }),
      );
    } catch (e) {
      print('❌ Error marking as read: $e');
    }
  }

  Future<void> _fetchMessages({bool silent = false}) async {
    try {
      final response = await api.get(
        Uri.parse('https://millerstorm.tech/api/storm-chat/messages/${widget.group['_id']}?userId=${widget.userId}&userRole=${widget.userRole}'),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body) as List;
        
        // Check if user is at bottom before updating
        bool wasAtBottom = false;
        bool hadMessages = messages.isNotEmpty;
        if (_scrollController.hasClients) {
          final maxScroll = _scrollController.position.maxScrollExtent;
          final currentScroll = _scrollController.position.pixels;
          wasAtBottom = (maxScroll - currentScroll) < 100;
        }
        
        // Check for new messages
        bool hasNewMessages = false;
        if (hadMessages && data.length > messages.length) {
          hasNewMessages = true;
        }
        
        setState(() {
          messages = data;
          if (!silent) isLoading = false;
          if (hasNewMessages && !wasAtBottom) {
            _hasNewMessages = true;
            _showScrollToBottomButton = true;
          }
        });
        
        // On initial load, go to the latest message. Re-jump after short delays
        // so images/videos finishing layout don't leave the view above bottom.
        if (!silent) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (_scrollController.hasClients) {
              _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
            }
          });
          for (final ms in [150, 400, 800]) {
            Future.delayed(Duration(milliseconds: ms), () {
              if (mounted && _scrollController.hasClients) {
                _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
              }
            });
          }
        } else if (wasAtBottom) {
          // If user was at bottom and new messages come, scroll to bottom
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (_scrollController.hasClients) {
              _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
            }
          });
        }
      } else if (response.statusCode == 403) {
        final error = json.decode(response.body);
        _showError(error['error'] ?? 'Access denied');
        if (!silent) {
          setState(() {
            isLoading = false;
          });
        }
      }
    } catch (e) {
      print('❌ Error fetching messages: $e');
      if (!silent) {
        setState(() {
          isLoading = false;
        });
      }
    }
  }



  void _scrollToMessage(String messageId) {
    // Find the index of the message
    final index = messages.indexWhere((msg) => msg['_id'] == messageId);
    if (index == -1) return;

    // Calculate approximate position
    // Each message is roughly 80-100px, use 90 as average
    final position = index * 90.0;
    
    // Scroll to the message
    _scrollController.animateTo(
      position,
      duration: const Duration(milliseconds: 500),
      curve: Curves.easeInOut,
    ).then((_) {
      // Start blinking animation
      setState(() {
        _blinkingMessageId = messageId;
      });
      
      // Stop blinking after 2 blinks (1 second)
      _blinkTimer?.cancel();
      _blinkTimer = Timer(const Duration(milliseconds: 1000), () {
        setState(() {
          _blinkingMessageId = null;
        });
      });
    });
  }

  Future<void> _sendMessage() async {
    if (_messageController.text.trim().isEmpty || isSending) return;

    final message = _messageController.text.trim();
    final replyData = replyingTo; // Store reply data before clearing
    _messageController.clear();

    setState(() {
      isSending = true;
      replyingTo = null; // Clear reply preview immediately
    });

    try {
      final body = {
        'senderId': widget.userId,
        'senderName': userName,
        'senderRole': widget.userRole,
        'message': message,
        'messageType': 'text',
      };

      // Add reply information if replying to a message
      if (replyData != null) {
        body['replyTo'] = replyData['_id'];
        body['replyToMessage'] = replyData['message'];
        body['replyToSender'] = replyData['senderName'];
        body['replyToMessageType'] = replyData['messageType'] ?? 'text';
        body['replyToMediaUrl'] = replyData['mediaUrl'] ?? '';
      }

      print('🔵 Sending message body: ${json.encode(body)}');

      final response = await api.post(
        Uri.parse('https://millerstorm.tech/api/storm-chat/messages/${widget.group['_id']}'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode(body),
      );

      print('🔵 Send message response: ${response.statusCode}');
      print('🔵 Send message response body: ${response.body}');

      if (response.statusCode == 201) {
        await _fetchMessages();
      } else {
        final error = json.decode(response.body);
        _showError(error['error'] ?? 'Failed to send message');
      }
    } catch (e) {
      print('❌ Error sending message: $e');
      _showError('Failed to send message');
    } finally {
      setState(() {
        isSending = false;
      });
    }
  }

  Future<void> _pickAndUploadMedia() async {
    final ImagePicker picker = ImagePicker();
    
    showModalBottomSheet(
      context: context,
      builder: (context) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library, color: Color(0xFFCB0002)),
              title: const Text('Choose from Gallery'),
              onTap: () async {
                Navigator.pop(context);
                // Compress on pick: cap resolution + re-encode so a 5–15MB phone
                // photo becomes a few hundred KB → fast upload AND fast display.
                final XFile? image = await picker.pickImage(
                  source: ImageSource.gallery,
                  imageQuality: 70,
                  maxWidth: 1920,
                  maxHeight: 1920,
                );
                if (image != null) {
                  _editAndSendImage(File(image.path));
                }
              },
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt, color: Color(0xFFCB0002)),
              title: const Text('Take Photo'),
              onTap: () async {
                Navigator.pop(context);
                final XFile? image = await picker.pickImage(
                  source: ImageSource.camera,
                  imageQuality: 70,
                  maxWidth: 1920,
                  maxHeight: 1920,
                );
                if (image != null) {
                  _editAndSendImage(File(image.path));
                }
              },
            ),
            ListTile(
              leading: const Icon(Icons.videocam, color: Color(0xFFCB0002)),
              title: const Text('Choose Video'),
              onTap: () async {
                Navigator.pop(context);
                final XFile? video = await picker.pickVideo(source: ImageSource.gallery);
                if (video != null) {
                  _uploadFile(File(video.path), 'video');
                }
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _editAndSendImage(File imageFile) async {
    try {
      final bytes = await imageFile.readAsBytes();
      final editedBytes = await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => ImageEditor(image: bytes),
        ),
      );
      if (!mounted) return;
      if (editedBytes != null) {
        final tempDir = await getTemporaryDirectory();
        final tempFile = File(
          '${tempDir.path}/send_${DateTime.now().millisecondsSinceEpoch}.jpg',
        );
        await tempFile.writeAsBytes(editedBytes);
        _uploadFile(tempFile, 'image');
      }
      // if editedBytes is null user cancelled — don't send
    } catch (e) {
      print('Edit before send error: $e');
      _uploadFile(imageFile, 'image');
    }
  }

  Future<void> _uploadFile(File file, String type) async {
    final fileSize = await file.length();
    final fileSizeMB = fileSize / (1024 * 1024);

    if (type == 'video' && fileSizeMB > 500) {
      _showError('Video size exceeds 500MB limit (${fileSizeMB.toStringAsFixed(1)}MB)');
      return;
    }
    if (type == 'image' && fileSizeMB > 30) {
      _showError('Image size exceeds 30MB limit');
      return;
    }

    setState(() { isUploading = true; });

    try {
      // Compress videos before upload — a raw phone video can be 100–200MB,
      // which is very slow to send. MediumQuality typically cuts it by ~70–85%.
      File uploadFile = file;
      if (type == 'video') {
        try {
          final info = await VideoCompress.compressVideo(
            file.path,
            quality: VideoQuality.MediumQuality,
            deleteOrigin: false,
            includeAudio: true,
          );
          if (info != null && info.file != null) {
            uploadFile = info.file!;
            final newMB = (await uploadFile.length()) / (1024 * 1024);
            print('🎞️ Compressed video: ${fileSizeMB.toStringAsFixed(1)}MB → ${newMB.toStringAsFixed(1)}MB');
          }
        } catch (e) {
          print('Video compress failed, uploading original: $e');
        }
      }

      final fileName = uploadFile.path.split('/').last;
      final mimeType = type == 'video' ? 'video/mp4' : 'image/jpeg';

      var request = http.MultipartRequest(
        'POST',
        Uri.parse('https://millerstorm.tech/api/direct-upload'),
      );
      request.headers['Accept'] = 'application/json';
      request.files.add(
        await http.MultipartFile.fromPath(
          'file',
          uploadFile.path,
          filename: fileName,
        ),
      );

      print('📤 Uploading $type: $fileName');

      final streamedResponse = await api.send(request).timeout(
        const Duration(minutes: 15),
        onTimeout: () => throw Exception('Upload timed out after 15 minutes'),
      );
      final response = await http.Response.fromStream(streamedResponse);

      print('📤 Upload response: ${response.statusCode} - ${response.body}');

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        final url = data['url'];

        await api.post(
          Uri.parse('https://millerstorm.tech/api/storm-chat/messages/${widget.group['_id']}'),
          headers: {'Content-Type': 'application/json'},
          body: json.encode({
            'senderId': widget.userId,
            'senderName': userName,
            'senderRole': widget.userRole,
            'message': fileName,
            'messageType': type,
            'mediaUrl': url,
          }),
        );

        await _fetchMessages();
      } else {
        String errorMsg = 'Upload failed (${response.statusCode})';
        try {
          final errorData = json.decode(response.body);
          if (errorData['error'] != null) errorMsg = errorData['error'];
        } catch (_) {}
        _showError(errorMsg);
      }
    } catch (e) {
      print('❌ Upload error: $e');
      _showError('Upload failed: ${e.toString().replaceAll('Exception: ', '')}');
    } finally {
      setState(() { isUploading = false; });
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: const Color(0xFFCB0002),
      ),
    );
  }

  /// Returns true if [utc] falls inside US Eastern Daylight Time
  /// (second Sunday of March 07:00 UTC → first Sunday of November 06:00 UTC).
  bool _isUsEasternDst(DateTime utc) {
    final year = utc.year;
    // Second Sunday of March (DST begins at 02:00 EST = 07:00 UTC).
    final firstSundayMarch =
        1 + ((7 - DateTime.utc(year, 3, 1).weekday) % 7);
    final dstStart =
        DateTime.utc(year, 3, firstSundayMarch + 7, 7);
    // First Sunday of November (DST ends at 02:00 EDT = 06:00 UTC).
    final firstSundayNov =
        1 + ((7 - DateTime.utc(year, 11, 1).weekday) % 7);
    final dstEnd = DateTime.utc(year, 11, firstSundayNov, 6);
    return utc.isAfter(dstStart) && utc.isBefore(dstEnd);
  }

  /// Convert any timestamp to US Eastern time (EDT/EST, DST-aware).
  DateTime _toEastern(DateTime date) {
    final utc = date.toUtc();
    final offset = _isUsEasternDst(utc) ? 4 : 5; // EDT = UTC-4, EST = UTC-5
    return utc.subtract(Duration(hours: offset));
  }

  String _formatTime(String dateStr) {
    final etDate = _toEastern(DateTime.parse(dateStr));
    final period = etDate.hour >= 12 ? 'PM' : 'AM';
    var hour12 = etDate.hour % 12;
    if (hour12 == 0) hour12 = 12;
    final minute = etDate.minute.toString().padLeft(2, '0');
    return '$hour12:$minute $period';
  }

  String _formatDate(String dateStr) {
    final etDate = _toEastern(DateTime.parse(dateStr));
    final nowEt = _toEastern(DateTime.now());
    final today = DateTime(nowEt.year, nowEt.month, nowEt.day);
    final yesterday = today.subtract(const Duration(days: 1));
    final messageDate = DateTime(etDate.year, etDate.month, etDate.day);

    if (messageDate == today) return 'Today';
    if (messageDate == yesterday) return 'Yesterday';

    return '${etDate.day}/${etDate.month}/${etDate.year}';
  }

  @override
  Widget build(BuildContext context) {
    // Theme colors
    final bgColor = _isDarkTheme ? Colors.black : const Color(0xFFF5F7FA);
    final inputAreaColor = _isDarkTheme ? const Color(0xFF1C1C1E) : const Color(0xFFFFFFFF);
    final textFieldColor = _isDarkTheme ? const Color(0xFF2C2C2E) : const Color(0xFFF3F4F6);
    final mentionListColor = _isDarkTheme ? const Color(0xFF1C1C1E) : const Color(0xFFFFFFFF);
    final inputTextColor = _isDarkTheme ? Colors.white : const Color(0xFF111827);
    
    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: const Color(0xFFCB0002),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
        title: InkWell(
          onTap: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (context) => StormChatGroupInfoScreen(
                  group: widget.group,
                  userId: widget.userId,
                  userRole: widget.userRole,
                ),
              ),
            );
          },
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: Colors.black,
                  borderRadius: BorderRadius.circular(8),
                  image: widget.group['imageUrl'] != null && widget.group['imageUrl'].isNotEmpty
                      ? DecorationImage(
                          image: NetworkImage('https://millerstorm.tech${widget.group['imageUrl']}'),
                          fit: BoxFit.cover,
                        )
                      : null,
                ),
                child: widget.group['imageUrl'] == null || widget.group['imageUrl'].isEmpty
                    ? const Center(
                        child: Text('👥', style: TextStyle(fontSize: 18)),
                      )
                    : null,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.group['name'] ?? 'Group',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      widget.group['isDirect'] == true
                          ? 'Private message'
                          : '${(widget.group['members'] as List?)?.length ?? 0} members',
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        actions: [
          IconButton(
            icon: Icon(
              _isDarkTheme ? Icons.light_mode : Icons.dark_mode,
              color: Colors.white,
            ),
            onPressed: () {
              setState(() {
                _isDarkTheme = !_isDarkTheme;
              });
            },
          ),
        ],
      ),
      body: Stack(
        children: [
          Column(
            children: [
              // Messages
              Expanded(
                child: isLoading
                    ? const Center(
                        child: CircularProgressIndicator(color: Color(0xFFCB0002)),
                      )
                    : messages.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: const [
                                Icon(Icons.chat_bubble_outline, size: 64, color: Colors.grey),
                                SizedBox(height: 16),
                                Text(
                                  'No messages yet',
                                  style: TextStyle(fontSize: 16, color: Colors.grey),
                                ),
                                SizedBox(height: 8),
                                Text(
                                  'Start the conversation!',
                                  style: TextStyle(fontSize: 14, color: Colors.grey),
                                ),
                              ],
                            ),
                          )
                        : GestureDetector(
                            onTap: () {
                              if (_emojiTrayMessageId != null) {
                                setState(() => _emojiTrayMessageId = null);
                              }
                            },
                            child: RefreshIndicator(
                            color: const Color(0xFFCB0002),
                            onRefresh: _fetchMessages,
                            child: ListView.builder(
                              controller: _scrollController,
                              padding: const EdgeInsets.all(16),
                              itemCount: messages.length,
                              itemBuilder: (context, index) {
                                return _buildMessage(messages[index], index);
                              },
                            ),
                          ),
                          ), // GestureDetector
              ),
          
          // Input
          Container(
            padding: EdgeInsets.only(
              left: 12,
              right: 12,
              top: 12,
              bottom: 12 + MediaQuery.of(context).padding.bottom,
            ),
            decoration: BoxDecoration(
              color: inputAreaColor,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.05),
                  blurRadius: 8,
                  offset: const Offset(0, -2),
                ),
              ],
            ),
            child: Column(
              children: [
                // Mention list
                if (_showMentionList)
                  Container(
                    constraints: const BoxConstraints(maxHeight: 200),
                    margin: const EdgeInsets.only(bottom: 8),
                    decoration: BoxDecoration(
                      color: mentionListColor,
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.1),
                          blurRadius: 8,
                          offset: const Offset(0, -2),
                        ),
                      ],
                    ),
                    child: _loadingMembers
                        ? const Padding(
                            padding: EdgeInsets.all(16),
                            child: Center(
                              child: CircularProgressIndicator(
                                color: Color(0xFFCB0002),
                                strokeWidth: 2,
                              ),
                            ),
                          )
                        : _filteredMembers.isEmpty
                            ? Padding(
                                padding: const EdgeInsets.all(16),
                                child: Text(
                                  'No members found',
                                  style: const TextStyle(
                                    color: Color(0xFF6B7280),
                                    fontSize: 14,
                                  ),
                                  textAlign: TextAlign.center,
                                ),
                              )
                            : ListView.builder(
                                shrinkWrap: true,
                                itemCount: _filteredMembers.length,
                                itemBuilder: (context, index) {
                                  final member = _filteredMembers[index];
                                  final name = member['name'] ?? 'Unknown';
                                  final headshotUrl = member['headshotUrl'] ?? '';
                                  
                                  return ListTile(
                                    dense: true,
                                    leading: CircleAvatar(
                                      radius: 18,
                                      backgroundColor: const Color(0xFFF3F4F6),
                                      backgroundImage: headshotUrl.isNotEmpty
                                          ? NetworkImage('https://millerstorm.tech$headshotUrl')
                                          : null,
                                      child: headshotUrl.isEmpty
                                          ? Text(
                                              name[0].toUpperCase(),
                                              style: const TextStyle(color: Color(0xFF6B7280), fontSize: 14),
                                            )
                                          : null,
                                    ),
                                    title: Text(
                                      name,
                                      style: TextStyle(
                                        color: _isDarkTheme ? Colors.white : const Color(0xFF111827),
                                        fontSize: 14,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                    onTap: () => _insertMention(name),
                                  );
                                },
                              ),
                  ),
                // Reply preview
                if (replyingTo != null)
                  Container(
                    padding: const EdgeInsets.all(8),
                    margin: const EdgeInsets.only(bottom: 8),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF3F4F6),
                      borderRadius: BorderRadius.circular(8),
                      border: Border(
                        left: BorderSide(
                          color: const Color(0xFFCB0002),
                          width: 3,
                        ),
                      ),
                    ),
                    child: Row(
                      children: [
                        if (replyingTo['messageType'] == 'image' &&
                            (replyingTo['mediaUrl'] ?? '').toString().isNotEmpty) ...[
                          ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: CachedNetworkImage(
                              imageUrl: (replyingTo['mediaUrl'] as String).startsWith('http')
                                  ? replyingTo['mediaUrl']
                                  : 'https://millerstorm.tech${replyingTo['mediaUrl']}',
                              width: 48,
                              height: 48,
                              fit: BoxFit.cover,
                              errorWidget: (_, __, ___) => const SizedBox(
                                width: 48,
                                height: 48,
                                child: Icon(Icons.image, size: 28, color: Color(0xFF6B7280)),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                        ],
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                replyingTo['senderName'] ?? 'Unknown',
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFFCB0002),
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                replyingTo['messageType'] == 'image'
                                    ? '📷 Photo'
                                    : replyingTo['messageType'] == 'video'
                                        ? '🎥 Video'
                                        : replyingTo['message'] ?? '',
                                style: const TextStyle(
                                  fontSize: 13,
                                  color: Color(0xFF6B7280),
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close, size: 20),
                          onPressed: () {
                            setState(() {
                              replyingTo = null;
                            });
                          },
                        ),
                      ],
                    ),
                  ),
                !canSendMessage
                    ? Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFEF2F2),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          widget.group['onlyAdminCanChat'] == true
                              ? '🔒 Only admins can send messages\nMembers can only read messages'
                              : (widget.group['admins'] as List?)?.isNotEmpty == true
                                  ? '🔒 Only group admins can send messages\nMembers can only read messages'
                                  : '🔒 You cannot send messages in this group',
                          style: const TextStyle(
                            color: Color(0xFFCB0002),
                            fontSize: 14,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      )
                    : Row(
                        children: [
                          IconButton(
                            icon: Icon(
                              isUploading ? Icons.hourglass_empty : Icons.attach_file,
                              color: const Color(0xFFCB0002),
                            ),
                            onPressed: isUploading ? null : _pickAndUploadMedia,
                          ),
                          Expanded(
                            child: Container(
                              decoration: BoxDecoration(
                                color: textFieldColor,
                                borderRadius: BorderRadius.circular(24),
                              ),
                              child: TextField(
                                controller: _messageController,
                                style: TextStyle(
                                  color: inputTextColor,
                                  fontSize: 16,
                                ),
                                decoration: InputDecoration(
                                  hintText: 'Type a message...',
                                  hintStyle: const TextStyle(
                                    color: Color(0xFF9CA3AF),
                                  ),
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(24),
                                    borderSide: BorderSide.none,
                                  ),
                                  enabledBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(24),
                                    borderSide: BorderSide.none,
                                  ),
                                  focusedBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(24),
                                    borderSide: const BorderSide(color: Color(0xFFCB0002), width: 2),
                                  ),
                                  contentPadding: const EdgeInsets.symmetric(
                                    horizontal: 16,
                                    vertical: 10,
                                  ),
                                  filled: true,
                                  fillColor: textFieldColor,
                                ),
                                focusNode: _messageFocusNode,
                                maxLines: null,
                                textInputAction: TextInputAction.send,
                                onSubmitted: (_) => _sendMessage(),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            decoration: const BoxDecoration(
                              color: Color(0xFFCB0002),
                              shape: BoxShape.circle,
                            ),
                            child: IconButton(
                              icon: Icon(
                                isSending ? Icons.hourglass_empty : Icons.send,
                                color: Colors.white,
                                size: 20,
                              ),
                              onPressed: isSending ? null : _sendMessage,
                            ),
                          ),
                        ],
                      ),
              ],
            ),
          ),
        ],
      ),
          // Scroll to bottom button
          if (_showScrollToBottomButton)
            Positioned(
              bottom: 100,
              right: 16,
              child: GestureDetector(
                onTap: _scrollToBottom,
                child: Stack(
                  alignment: Alignment.topRight,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFCB0002),
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.2),
                            blurRadius: 8,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: const Icon(
                        Icons.arrow_downward,
                        color: Colors.white,
                        size: 24,
                      ),
                    ),
                    if (_hasNewMessages)
                      Container(
                        width: 12,
                        height: 12,
                        margin: const EdgeInsets.only(right: 2, top: 2),
                        decoration: const BoxDecoration(
                          color: Colors.green,
                          shape: BoxShape.circle,
                        ),
                      ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildMessage(dynamic message, int index) {
    final isMyMessage = _isMine(message);
    final showDate = index == 0 ||
        _formatDate(messages[index - 1]['createdAt']) != _formatDate(message['createdAt']);
    final isBlinking = _blinkingMessageId == message['_id'];

    // Look up original replied-to message from local list (server may not return these fields)
    final replyToId = message['replyTo']?.toString() ?? '';
    dynamic originalMsg;
    if (replyToId.isNotEmpty) {
      try {
        originalMsg = messages.firstWhere((m) => m['_id'] == replyToId);
      } catch (_) {
        originalMsg = null;
      }
    }
    final effectiveReplyType = message['replyToMessageType'] ?? originalMsg?['messageType'] ?? 'text';
    final effectiveReplyMediaUrl = (message['replyToMediaUrl'] ?? originalMsg?['mediaUrl'] ?? '').toString();
    
    // Theme colors for message bubbles
    final messageBubbleOther = _isDarkTheme ? const Color(0xFF2C2C2E) : const Color(0xFFF3F4F6);
    final dateChipColor = _isDarkTheme ? const Color(0xFF2C2C2E) : const Color(0xFFF3F4F6);
    final dateTextColor = _isDarkTheme ? const Color(0xFF9CA3AF) : const Color(0xFF6B7280);

    return Column(
      children: [
        if (showDate)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: dateChipColor,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                _formatDate(message['createdAt']),
                style: TextStyle(
                  fontSize: 12,
                  color: dateTextColor,
                ),
              ),
            ),
          ),
        // Swipeable message with animation
        _SwipeableMessage(
          onSwipeRight: () {
            setState(() {
              replyingTo = message;
            });
            _messageFocusNode.requestFocus();
          },
          child: GestureDetector(
            onLongPress: () {
              setState(() {
                _longPressedMessage = message;
                _emojiTrayMessageId = message['_id'];
              });
            },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              decoration: BoxDecoration(
                color: isBlinking ? Colors.yellow.withOpacity(0.3) : Colors.transparent,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Align(
                alignment: isMyMessage ? Alignment.centerRight : Alignment.centerLeft,
                child: Column(
                  crossAxisAlignment: isMyMessage ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                  children: [
                    // Floating emoji tray above message on long press
                    if (_emojiTrayMessageId == message['_id'])
                      GestureDetector(
                        onTap: () {},
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 6),
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                          decoration: BoxDecoration(
                            color: _isDarkTheme ? const Color(0xFF2C2C2E) : Colors.white,
                            borderRadius: BorderRadius.circular(28),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withOpacity(0.18),
                                blurRadius: 12,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                          child: SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                for (final e in ['❤️','👍','👎','😂','🎉','🔥','😢'])
                                  GestureDetector(
                                    onTap: () {
                                      setState(() => _emojiTrayMessageId = null);
                                      _addReaction(message, e);
                                    },
                                    child: Padding(
                                      padding: const EdgeInsets.symmetric(horizontal: 5),
                                      child: Text(e, style: const TextStyle(fontSize: 26)),
                                    ),
                                  ),
                                GestureDetector(
                                  onTap: () {
                                    setState(() => _emojiTrayMessageId = null);
                                    _showMessageOptions(context, message);
                                  },
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 5),
                                    child: Icon(Icons.more_horiz,
                                      size: 26,
                                      color: _isDarkTheme ? Colors.white70 : Colors.black54),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    Stack(
                      clipBehavior: Clip.none,
                      children: [
                    Container(
                      constraints: BoxConstraints(
                        maxWidth: MediaQuery.of(context).size.width * 0.7,
                      ),
                      margin: const EdgeInsets.only(bottom: 8),
                      child: Column(
                        crossAxisAlignment: isMyMessage ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                        children: [
                          if (!isMyMessage)
                            Padding(
                              padding: const EdgeInsets.only(left: 8, bottom: 4),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                crossAxisAlignment: CrossAxisAlignment.baseline,
                                textBaseline: TextBaseline.alphabetic,
                                children: [
                                  Text(
                                    message['senderName'] ?? 'Unknown',
                                    style: const TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                      color: Color(0xFF6B7280),
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    _formatTime(message['createdAt']),
                                    style: const TextStyle(
                                      fontSize: 10,
                                      color: Color(0xFF9CA3AF),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          // Different styling for different message types
                          if (message['messageType'] == 'text')
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                              decoration: BoxDecoration(
                                color: isMyMessage ? const Color(0xFFCB0002) : messageBubbleOther,
                                borderRadius: BorderRadius.only(
                                  topLeft: const Radius.circular(16),
                                  topRight: const Radius.circular(16),
                                  bottomLeft: Radius.circular(isMyMessage ? 16 : 4),
                                  bottomRight: Radius.circular(isMyMessage ? 4 : 16),
                                ),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  // Show reply preview inside the bubble
                                  if (message['replyTo'] != null && 
                                      message['replyTo'].toString().isNotEmpty &&
                                      message['replyToMessage'] != null &&
                                      message['replyToMessage'].toString().isNotEmpty)
                                    GestureDetector(
                                      onTap: () {
                                        _scrollToMessage(message['replyTo']);
                                      },
                                      child: Container(
                                        margin: const EdgeInsets.only(bottom: 6),
                                        padding: const EdgeInsets.all(8),
                                        decoration: BoxDecoration(
                                          color: isMyMessage
                                              ? Colors.white.withOpacity(0.2)
                                              : Colors.white,
                                          borderRadius: BorderRadius.circular(8),
                                          border: Border(
                                            left: BorderSide(
                                              color: isMyMessage ? Colors.white : const Color(0xFFCB0002),
                                              width: 3,
                                            ),
                                          ),
                                        ),
                                        child: Row(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            if (effectiveReplyType == 'image' && effectiveReplyMediaUrl.isNotEmpty) ...[
                                              ClipRRect(
                                                borderRadius: BorderRadius.circular(4),
                                                child: CachedNetworkImage(
                                                  imageUrl: effectiveReplyMediaUrl.startsWith('http')
                                                      ? effectiveReplyMediaUrl
                                                      : 'https://millerstorm.tech$effectiveReplyMediaUrl',
                                                  width: 40,
                                                  height: 40,
                                                  fit: BoxFit.cover,
                                                  errorWidget: (_, __, ___) => const SizedBox(
                                                    width: 40,
                                                    height: 40,
                                                    child: Icon(Icons.image, size: 24, color: Colors.white54),
                                                  ),
                                                ),
                                              ),
                                              const SizedBox(width: 6),
                                            ],
                                            Expanded(
                                              child: Column(
                                                crossAxisAlignment: CrossAxisAlignment.start,
                                                children: [
                                                  Text(
                                                    message['replyToSender'] ?? 'Unknown',
                                                    style: TextStyle(
                                                      fontSize: 11,
                                                      fontWeight: FontWeight.w600,
                                                      color: isMyMessage ? Colors.white : const Color(0xFFCB0002),
                                                    ),
                                                  ),
                                                  const SizedBox(height: 2),
                                                  Text(
                                                    effectiveReplyType == 'image'
                                                        ? '📷 Photo'
                                                        : effectiveReplyType == 'video'
                                                            ? '🎥 Video'
                                                            : message['replyToMessage'] ?? '',
                                                    style: TextStyle(
                                                      fontSize: 12,
                                                      color: isMyMessage
                                                          ? Colors.white.withOpacity(0.8)
                                                          : const Color(0xFF6B7280),
                                                    ),
                                                    maxLines: 1,
                                                    overflow: TextOverflow.ellipsis,
                                                  ),
                                                ],
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  _buildMessageContent(message, isMyMessage),
                                ],
                              ),
                            )
                          else
                            // No background for images/videos
                            _buildMessageContent(message, isMyMessage),
                          if (isMyMessage)
                            Padding(
                              padding: const EdgeInsets.only(
                                right: 8,
                                top: 4,
                              ),
                              child: Text(
                                _formatTime(message['createdAt']),
                                style: const TextStyle(
                                  fontSize: 10,
                                  color: Color(0xFF9CA3AF),
                                ),
                              ),
                            ),
                          // Reactions below the bubble (no overlap with text)
                          _buildReactions(message, isMyMessage),
                        ],
                      ),
                    ),
                  ],
                ), // Stack
                  ], // Column children
                ), // Column
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildReactions(dynamic message, bool isMyMessage) {
    // Get reactions from message (sample data for now)
    final reactions = message['reactions'] as List? ?? [];
    
    if (reactions.isEmpty) return const SizedBox();
    
    // Count reactions by emoji
    final Map<String, int> reactionCounts = {};
    for (final reaction in reactions) {
      final emoji = reaction['emoji'] as String?;
      if (emoji != null) {
        reactionCounts[emoji] = (reactionCounts[emoji] ?? 0) + 1;
      }
    }
    
    if (reactionCounts.isEmpty) return const SizedBox();

    // Rendered BELOW the bubble (not overlapping the text). Compact pill.
    return Padding(
      padding: EdgeInsets.only(
        top: 4,
        left: isMyMessage ? 0 : 8,
        right: isMyMessage ? 8 : 0,
      ),
      child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
          decoration: BoxDecoration(
            color: _isDarkTheme ? const Color(0xFF2C2C2E) : Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: _isDarkTheme ? Colors.grey[700]! : Colors.grey[300]!,
              width: 1,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.08),
                blurRadius: 3,
                offset: const Offset(0, 1),
              ),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: reactionCounts.entries.map((entry) {
              final emoji = entry.key;
              final count = entry.value;
              return GestureDetector(
                onTap: () => _showReactionDetails(message, emoji),
                child: Container(
                  margin: EdgeInsets.only(right: entry != reactionCounts.entries.last ? 3 : 0),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(emoji, style: const TextStyle(fontSize: 11)),
                      const SizedBox(width: 2),
                      Text(
                        count.toString(),
                        style: TextStyle(
                          fontSize: 9,
                          color: _isDarkTheme ? Colors.white70 : Colors.black54,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
        ),
    );
  }

  void _showReactionDetails(dynamic message, String emoji) {
    final reactions = (message['reactions'] as List? ?? [])
        .where((r) => r['emoji'] == emoji)
        .toList();
    final iReacted = reactions.any((r) => r['userId'] == widget.userId);
    final bgColor = _isDarkTheme ? const Color(0xFF1C1C1E) : Colors.white;
    final textColor = _isDarkTheme ? Colors.white : Colors.black87;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(16),
            topRight: Radius.circular(16),
          ),
        ),
        padding: const EdgeInsets.only(top: 12, bottom: 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Handle
            Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: Colors.grey[400],
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 12),
            // Header
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  Text(emoji, style: const TextStyle(fontSize: 28)),
                  const SizedBox(width: 8),
                  Text(
                    '${reactions.length} ${reactions.length == 1 ? 'reaction' : 'reactions'}',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: textColor),
                  ),
                ],
              ),
            ),
            const Divider(height: 20),
            // User list
            ...reactions.map((r) {
              final isMe = r['userId'] == widget.userId;
              return ListTile(
                leading: CircleAvatar(
                  radius: 20,
                  backgroundColor: const Color(0xFFF3F4F6),
                  child: Text(
                    ((r['userName'] as String? ?? '?')[0]).toUpperCase(),
                    style: const TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF374151)),
                  ),
                ),
                title: Text(
                  isMe ? '${r['userName']} (You)' : r['userName'] ?? 'Unknown',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: textColor,
                  ),
                ),
                trailing: isMe
                    ? GestureDetector(
                        onTap: () {
                          Navigator.pop(ctx);
                          _addReaction(message, emoji); // toggles off
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFEE2E2),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: const Text(
                            'Remove',
                            style: TextStyle(
                              fontSize: 13,
                              color: Color(0xFFCB0002),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      )
                    : null,
              );
            }).toList(),
          ],
        ),
      ),
    );
  }

  void _showMessageOptions(BuildContext context, dynamic message) {
    final isMyMessage = _isMine(message);
    final textColor = _isDarkTheme ? Colors.white : Colors.black;
    final bgColor = _isDarkTheme ? const Color(0xFF1C1C1E) : Colors.white;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(16),
            topRight: Radius.circular(16),
          ),
        ),
        child: SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Emoji bar
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                child: Row(
                  children: [
                    _buildEmojiOption('❤️', () { Navigator.pop(context); _addReaction(message, '❤️'); }),
                    _buildEmojiOption('👍', () { Navigator.pop(context); _addReaction(message, '👍'); }),
                    _buildEmojiOption('👎', () { Navigator.pop(context); _addReaction(message, '👎'); }),
                    _buildEmojiOption('😂', () { Navigator.pop(context); _addReaction(message, '😂'); }),
                    _buildEmojiOption('🎉', () { Navigator.pop(context); _addReaction(message, '🎉'); }),
                    _buildEmojiOption('🔥', () { Navigator.pop(context); _addReaction(message, '🔥'); }),
                    _buildEmojiOption('😢', () { Navigator.pop(context); _addReaction(message, '😢'); }),
                    _buildEmojiOption('➕', () => _showMoreEmojis(context, message)),
                  ],
                ),
              ),
              const Divider(height: 1),
              // Options
              ListTile(
                leading: Icon(Icons.reply, color: textColor),
                title: Text('Reply', style: TextStyle(color: textColor)),
                onTap: () {
                  Navigator.pop(context);
                  setState(() {
                    replyingTo = message;
                  });
                },
              ),
              if (message['messageType'] == 'text')
                ListTile(
                  leading: Icon(Icons.copy, color: textColor),
                  title: Text('Copy text', style: TextStyle(color: textColor)),
                  onTap: () {
                    Navigator.pop(context);
                    Clipboard.setData(ClipboardData(text: message['message'] ?? ''));
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Text copied to clipboard')),
                    );
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEmojiOption(String emoji, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: _isDarkTheme ? const Color(0xFF2C2C2E) : const Color(0xFFF3F4F6),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          emoji,
          style: const TextStyle(fontSize: 24),
        ),
      ),
    );
  }

  void _addReaction(dynamic message, String emoji) {

    final messageId = message['_id'];
    final messageIndex = messages.indexWhere((m) => m['_id'] == messageId);

    // Optimistic update
    if (messageIndex != -1) {
      setState(() {
        final updated = Map<String, dynamic>.from(messages[messageIndex]);
        final reactions = List<dynamic>.from(updated['reactions'] ?? []);
        final existing = reactions.indexWhere(
          (r) => r['userId'] == widget.userId && r['emoji'] == emoji,
        );
        if (existing != -1) {
          reactions.removeAt(existing);
        } else {
          reactions.add({'emoji': emoji, 'userId': widget.userId, 'userName': userName});
        }
        updated['reactions'] = reactions;
        messages[messageIndex] = updated;
      });
    }

    // Save to server
    api.patch(
      Uri.parse('https://millerstorm.tech/api/storm-chat/messages/${widget.group['_id']}'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({
        'messageId': messageId,
        'emoji': emoji,
        'userId': widget.userId,
        'userName': userName,
      }),
    ).then((response) {
      if (response.statusCode == 200) {
        // Server confirmed — update local message with server response
        final serverMsg = json.decode(response.body);
        if (mounted) {
          setState(() {
            final idx = messages.indexWhere((m) => m['_id'] == messageId);
            if (idx != -1) messages[idx] = serverMsg;
          });
        }
      }
    }).catchError((e) {
      print('Reaction save error: $e');
    });
  }

  void _showMoreEmojis(BuildContext context, dynamic message) {
    Navigator.pop(context);
    // TODO: Show more emojis picker
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('More emojis coming soon!')),
    );
  }

  Widget _buildMessageContent(dynamic message, bool isMyMessage) {
    final messageType = message['messageType'] ?? 'text';
    final textColor = isMyMessage ? Colors.white : (_isDarkTheme ? Colors.white : const Color(0xFF111827));

    if (messageType == 'text') {
      return _buildTextWithLinks(message['message'] ?? '', textColor, isMyMessage);
    } else if (messageType == 'image' && message['mediaUrl'] != null) {
      final imageUrl = message['mediaUrl'].toString().startsWith('http')
          ? message['mediaUrl'].toString()
          : 'https://millerstorm.tech${message['mediaUrl']}';
      return GestureDetector(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => ImageViewerScreen(
                imageUrl: imageUrl,
                groupId: widget.group['_id'],
                userId: widget.userId,
                userName: userName,
                userRole: widget.userRole,
              ),
            ),
          );
        },
        child: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: CachedNetworkImage(
            imageUrl: imageUrl,
            width: 200,
            height: 150,
            fit: BoxFit.cover,
            // Decode to a small thumbnail (not the full-res image) so the chat
            // list stays fast and light on memory.
            memCacheWidth: 400,
            fadeInDuration: const Duration(milliseconds: 150),
            placeholder: (context, url) => Container(
              width: 200,
              height: 150,
              color: Colors.grey[200],
              child: const Center(
                child: CircularProgressIndicator(
                  color: Color(0xFFCB0002),
                  strokeWidth: 2,
                ),
              ),
            ),
            errorWidget: (context, url, error) => Container(
              width: 200,
              height: 150,
              color: Colors.grey[300],
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.broken_image, size: 48, color: Colors.grey[600]),
                  const SizedBox(height: 8),
                  Text(
                    'Image failed to load',
                    style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    } else if (messageType == 'video' && message['mediaUrl'] != null) {
      final videoUrl = message['mediaUrl'];
      print('🎥 Video message URL: $videoUrl');
      
      return GestureDetector(
        onTap: () {
          print('🎥 Opening video viewer for: $videoUrl');
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => VideoViewerScreen(
                videoUrl: videoUrl,
                fileName: message['message'],
              ),
            ),
          );
        },
        child: Stack(
          alignment: Alignment.center,
          children: [
            Container(
              width: 200,
              height: 150,
              decoration: BoxDecoration(
                color: Colors.black87,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.grey[700]!, width: 1),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: const [
                      Icon(Icons.videocam, size: 48, color: Colors.white70),
                      SizedBox(height: 8),
                      Text(
                        'Video',
                        style: TextStyle(fontSize: 12, color: Colors.white70),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            Container(
              width: 60,
              height: 60,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.9),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.play_arrow,
                size: 40,
                color: Color(0xFFCB0002),
              ),
            ),
          ],
        ),
      );
    }

    return Text(
      message['message'] ?? '',
      style: TextStyle(fontSize: 14, color: textColor),
    );
  }

  Widget _buildTextWithLinks(String text, Color textColor, bool isMyMessage) {
    final RegExp urlRegExp = RegExp(
      r'https?://[^\s]+',
      caseSensitive: false,
    );

    final List<TextSpan> spans = [];
    int start = 0;

    // Build a list of all possible user names from members AND message senders
    final Set<String> allUserNames = {};
    
    // Add all member names
    for (final member in _allMembers) {
      final memberName = member['name'] ?? '';
      if (memberName.isNotEmpty) {
        allUserNames.add(memberName);
      }
    }
    
    // Add all sender names from messages (to catch users not in member list)
    for (final message in messages) {
      final senderName = message['senderName'] ?? '';
      if (senderName.isNotEmpty) {
        allUserNames.add(senderName);
      }
    }
    
    // Add current user name
    if (userName != null && userName!.isNotEmpty) {
      allUserNames.add(userName!);
    }

    // Build a list of all possible mentions
    final List<MapEntry<int, String>> allMatches = [];
    
    // Add URL matches
    for (final Match match in urlRegExp.allMatches(text)) {
      allMatches.add(MapEntry(match.start, 'url:${match.group(0)}'));
    }
    
    // Check for mentions based on actual user names
    for (final name in allUserNames) {
      final mentionText = '@$name';
      int index = 0;
      
      // Find all occurrences of this user's mention in the text
      while (index < text.length) {
        index = text.indexOf(mentionText, index);
        if (index == -1) break;
        
        // Check if this is a valid mention (not part of a longer word)
        final endIndex = index + mentionText.length;
        final isValidEnd = endIndex >= text.length || 
                          !RegExp(r'[a-zA-Z]').hasMatch(text[endIndex]);
        
        if (isValidEnd) {
          allMatches.add(MapEntry(index, 'mention:$mentionText'));
        }
        
        index = endIndex;
      }
    }
    
    // Sort by position and remove overlapping matches
    allMatches.sort((a, b) => a.key.compareTo(b.key));
    
    // Remove overlapping matches (keep the first one)
    final List<MapEntry<int, String>> filteredMatches = [];
    int lastEnd = 0;
    for (final match in allMatches) {
      final position = match.key;
      if (position >= lastEnd) {
        filteredMatches.add(match);
        final content = match.value.substring(match.value.indexOf(':') + 1);
        lastEnd = position + content.length;
      }
    }

    for (final entry in filteredMatches) {
      final position = entry.key;
      final value = entry.value;
      final type = value.split(':')[0];
      final content = value.substring(value.indexOf(':') + 1);
      
      // Add text before this match
      if (position > start) {
        spans.add(TextSpan(
          text: text.substring(start, position),
          style: TextStyle(fontSize: 14, color: textColor),
        ));
      }

      if (type == 'url') {
        // Add clickable URL
        spans.add(TextSpan(
          text: content,
          style: TextStyle(
            fontSize: 14,
            color: textColor == Colors.white ? Colors.lightBlueAccent : Colors.blue,
            decoration: TextDecoration.underline,
          ),
          recognizer: TapGestureRecognizer()
            ..onTap = () async {
              try {
                final Uri uri = Uri.parse(content);
                bool launched = false;
                
                if (await canLaunchUrl(uri)) {
                  launched = await launchUrl(
                    uri,
                    mode: LaunchMode.externalApplication,
                  );
                }
                
                if (!launched && await canLaunchUrl(uri)) {
                  launched = await launchUrl(
                    uri,
                    mode: LaunchMode.platformDefault,
                  );
                }
                
                if (!launched) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text('Could not launch $content'),
                        backgroundColor: Colors.red,
                      ),
                    );
                  }
                }
              } catch (e) {
                print('Error launching URL: $e');
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Error: ${e.toString()}'),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              }
            },
        ));
      } else if (type == 'mention') {
        // Add mention - white for my messages, white in dark theme for others, red in light theme for others
        final mentionColor = isMyMessage 
            ? Colors.white 
            : (_isDarkTheme ? Colors.white : const Color(0xFFCB0002));
        
        spans.add(TextSpan(
          text: content,
          style: TextStyle(
            fontSize: 14,
            color: mentionColor,
            fontWeight: FontWeight.w600,
          ),
        ));
      }

      start = position + content.length;
    }

    // Add remaining text after the last match
    if (start < text.length) {
      spans.add(TextSpan(
        text: text.substring(start),
        style: TextStyle(fontSize: 14, color: textColor),
      ));
    }

    return RichText(
      text: TextSpan(children: spans),
    );
  }
}

// Swipeable Message Widget with smooth animation
class _SwipeableMessage extends StatefulWidget {
  final Widget child;
  final VoidCallback onSwipeRight;

  const _SwipeableMessage({
    required this.child,
    required this.onSwipeRight,
  });

  @override
  State<_SwipeableMessage> createState() => _SwipeableMessageState();
}

class _SwipeableMessageState extends State<_SwipeableMessage>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<Offset> _animation;
  double _dragExtent = 0;
  bool _dragUnderway = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 200),
      vsync: this,
    );
    _animation = Tween<Offset>(
      begin: Offset.zero,
      end: Offset.zero,
    ).animate(_controller);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _handleDragStart(DragStartDetails details) {
    _dragUnderway = true;
    _controller.stop();
  }

  void _handleDragUpdate(DragUpdateDetails details) {
    if (!_dragUnderway) return;

    final delta = details.primaryDelta!;
    _dragExtent += delta;

    // Only allow swipe to right and limit to 80px
    if (_dragExtent > 0) {
      setState(() {
        _dragExtent = _dragExtent.clamp(0.0, 80.0);
      });
    } else {
      _dragExtent = 0;
    }
  }

  void _handleDragEnd(DragEndDetails details) {
    if (!_dragUnderway) return;
    _dragUnderway = false;

    // If swiped more than 40px, trigger reply
    if (_dragExtent > 40) {
      widget.onSwipeRight();
    }

    // Animate back to original position
    _controller.reset();
    setState(() {
      _dragExtent = 0;
    });
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onHorizontalDragStart: _handleDragStart,
      onHorizontalDragUpdate: _handleDragUpdate,
      onHorizontalDragEnd: _handleDragEnd,
      child: Stack(
        children: [
          // Reply icon that appears when swiping
          if (_dragExtent > 0)
            Positioned(
              left: 10,
              top: 0,
              bottom: 0,
              child: Center(
                child: Opacity(
                  opacity: (_dragExtent / 40).clamp(0.0, 1.0),
                  child: Icon(
                    Icons.reply,
                    color: Colors.grey[600],
                    size: 24,
                  ),
                ),
              ),
            ),
          // Message that moves
          Transform.translate(
            offset: Offset(_dragExtent, 0),
            child: widget.child,
          ),
        ],
      ),
    );
  }
}
