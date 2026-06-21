import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:file_picker/file_picker.dart';
import 'dart:io';

class AiCloneChatScreen extends StatefulWidget {
  final dynamic bot;

  const AiCloneChatScreen({Key? key, required this.bot}) : super(key: key);

  @override
  State<AiCloneChatScreen> createState() => _AiCloneChatScreenState();
}

class _AiCloneChatScreenState extends State<AiCloneChatScreen> {
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  List<Map<String, dynamic>> messages = [];
  List<Map<String, dynamic>> chatSessions = [];
  String? currentChatId;
  bool isLoading = false;
  bool isSending = false;
  bool showHistory = false;
  String? userId;
  String? userName;
  List<Map<String, String>> attachments = [];

  @override
  void initState() {
    super.initState();
    _loadUserData().then((_) {
      _startNewChat();
      _loadChatSessions();
    });
  }

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _loadUserData() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userStr = prefs.getString('user');
      if (userStr != null) {
        final user = jsonDecode(userStr);
        setState(() {
          userId = user['id'] ?? user['_id'];
          userName = user['name'] ?? 'User';
        });
        print('User loaded - userId: $userId, userName: $userName');
      }
    } catch (e) {
      print('Error loading user data: $e');
    }
  }

  void _startNewChat() {
    setState(() {
      currentChatId = 'chat-${DateTime.now().millisecondsSinceEpoch}';
      messages = [];
      attachments = [];
    });
  }

  Future<void> _loadChatSessions() async {
    if (userId == null) return;

    try {
      final botId = widget.bot['id'] ?? widget.bot['_id'];
      print('Loading chat sessions for userId: $userId, botId: $botId');
      
      final response = await http.get(
        Uri.parse('https://millerstorm.tech/api/ai-bots/chats?userId=$userId&botId=$botId'),
      );

      print('Chat sessions response status: ${response.statusCode}');
      print('Chat sessions response body: ${response.body}');

      if (response.statusCode == 200) {
        final data = json.decode(response.body) as List;
        setState(() {
          chatSessions = data.map((session) => {
            'chatId': session['chatId'],
            'title': session['title'],
            'messages': session['messages'],
            'updatedAt': session['updatedAt'],
          }).toList().cast<Map<String, dynamic>>();
        });
        print('Loaded ${chatSessions.length} chat sessions');
      }
    } catch (e) {
      print('Error loading chat sessions: $e');
    }
  }

  void _loadSession(Map<String, dynamic> session) {
    setState(() {
      currentChatId = session['chatId'];
      messages = List<Map<String, dynamic>>.from(session['messages']);
      showHistory = false;
    });
    _scrollToBottom();
  }

  Future<void> _pickFile() async {
    try {
      FilePickerResult? result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx', 'txt'],
      );

      if (result != null && result.files.single.path != null) {
        final file = File(result.files.single.path!);
        final bytes = await file.readAsBytes();
        final base64 = base64Encode(bytes);
        
        setState(() {
          attachments.add({
            'name': result.files.single.name,
            'url': 'data:${result.files.single.extension};base64,$base64',
            'type': result.files.single.extension ?? 'file',
          });
        });
      }
    } catch (e) {
      print('Error picking file: $e');
    }
  }

  Future<void> _sendMessage() async {
    if ((_messageController.text.trim().isEmpty && attachments.isEmpty) || isSending || userId == null) return;

    final userMessage = _messageController.text.trim();
    _messageController.clear();

    final userMsg = {
      'role': 'user',
      'content': userMessage,
      'timestamp': DateTime.now().toIso8601String(),
      if (attachments.isNotEmpty) 'attachments': List.from(attachments),
    };

    final newMessages = [...messages, userMsg];

    setState(() {
      messages = newMessages;
      attachments = [];
      isSending = true;
    });

    _scrollToBottom();

    try {
      final botId = widget.bot['id'] ?? widget.bot['_id'];
      final prefs = await SharedPreferences.getInstance();
      final userStr = prefs.getString('user');
      final user = userStr != null ? jsonDecode(userStr) : null;
      
      final requestBody = {
        'botId': botId,
        'userId': userId,
        'chatId': currentChatId,
        'messages': newMessages,
        'userName': userName ?? user?['name'] ?? 'User',
        'userEmail': user?['email'] ?? '',
        'userRole': user?['role'] ?? '',
      };

      print('Sending request to API: $requestBody');

      final response = await http.post(
        Uri.parse('https://millerstorm.tech/api/ai-bots/chat'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode(requestBody),
      );

      print('Response status: ${response.statusCode}');
      print('Response body: ${response.body}');

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        final botReply = data['message'] ?? 'Sorry, I could not process your request.';

        setState(() {
          messages.add({
            'role': 'assistant',
            'content': botReply,
            'timestamp': DateTime.now().toIso8601String(),
          });
          isSending = false;
        });

        // Wait a bit before reloading chat sessions to ensure DB is updated
        await Future.delayed(const Duration(milliseconds: 500));
        await _loadChatSessions();
        _scrollToBottom();
      } else {
        print('Error response: ${response.body}');
        setState(() {
          messages.add({
            'role': 'assistant',
            'content': 'Sorry, something went wrong. Please try again.',
            'timestamp': DateTime.now().toIso8601String(),
          });
          isSending = false;
        });
      }
    } catch (e) {
      print('Error sending message: $e');
      setState(() {
        messages.add({
          'role': 'assistant',
          'content': 'Network error. Please check your connection.',
          'timestamp': DateTime.now().toIso8601String(),
        });
        isSending = false;
      });
    }
  }

  Future<void> _deleteSession(String chatId) async {
    try {
      final response = await http.delete(
        Uri.parse('https://millerstorm.tech/api/ai-bots/chats'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'chatId': chatId}),
      );

      if (response.statusCode == 200) {
        setState(() {
          chatSessions.removeWhere((s) => s['chatId'] == chatId);
          if (currentChatId == chatId) {
            _startNewChat();
          }
        });
      }
    } catch (e) {
      print('Error deleting session: $e');
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  String _formatTime(String timestamp) {
    try {
      final date = DateTime.parse(timestamp);
      final hour = date.hour.toString().padLeft(2, '0');
      final minute = date.minute.toString().padLeft(2, '0');
      return '$hour:$minute';
    } catch (e) {
      return '';
    }
  }

  String _formatDate(String timestamp) {
    try {
      final date = DateTime.parse(timestamp);
      final now = DateTime.now();
      final diff = now.difference(date);
      
      if (diff.inDays == 0) {
        return 'Today';
      } else if (diff.inDays == 1) {
        return 'Yesterday';
      } else if (diff.inDays < 7) {
        return '${diff.inDays} days ago';
      } else {
        return '${date.day}/${date.month}/${date.year}';
      }
    } catch (e) {
      return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    final botName = widget.bot['name'] ?? 'AI Bot';
    final botImageUrl = widget.bot['imageUrl'] ?? '';

    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        backgroundColor: const Color(0xFFCB0002),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
        title: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
                image: botImageUrl.isNotEmpty
                    ? DecorationImage(
                        image: NetworkImage('https://millerstorm.tech$botImageUrl'),
                        fit: BoxFit.cover,
                      )
                    : null,
              ),
              child: botImageUrl.isEmpty
                  ? const Icon(
                      Icons.smart_toy,
                      size: 20,
                      color: Color(0xFFCB0002),
                    )
                  : null,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                botName,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.history, color: Colors.white),
            onPressed: () {
              setState(() {
                showHistory = !showHistory;
              });
            },
          ),
          IconButton(
            icon: const Icon(Icons.add, color: Colors.white),
            onPressed: _startNewChat,
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
                    child: CircularProgressIndicator(
                      color: Color(0xFFCB0002),
                    ),
                  )
                : messages.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(
                              width: 80,
                              height: 80,
                              decoration: BoxDecoration(
                                color: const Color(0xFFF3F4F6),
                                borderRadius: BorderRadius.circular(16),
                                image: botImageUrl.isNotEmpty
                                    ? DecorationImage(
                                        image: NetworkImage('https://millerstorm.tech$botImageUrl'),
                                        fit: BoxFit.cover,
                                      )
                                    : null,
                              ),
                              child: botImageUrl.isEmpty
                                  ? const Icon(
                                      Icons.smart_toy,
                                      size: 40,
                                      color: Color(0xFFCB0002),
                                    )
                                  : null,
                            ),
                            const SizedBox(height: 16),
                            Text(
                              'Chat with $botName',
                              style: const TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w600,
                                color: Color(0xFF111827),
                              ),
                            ),
                            const SizedBox(height: 8),
                            const Text(
                              'Start a conversation!',
                              style: TextStyle(
                                fontSize: 14,
                                color: Color(0xFF6B7280),
                              ),
                            ),
                          ],
                        ),
                      )
                    : ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.all(16),
                        itemCount: messages.length + (isSending ? 1 : 0),
                        itemBuilder: (context, index) {
                          if (index == messages.length && isSending) {
                            return _buildThinkingIndicator();
                          }
                          return _buildMessage(messages[index]);
                        },
                      ),
              ),

              // Attachments preview
              if (attachments.isNotEmpty)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    border: Border(top: BorderSide(color: Colors.grey.shade200)),
                  ),
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: attachments.asMap().entries.map((entry) {
                        final idx = entry.key;
                        final att = entry.value;
                        return Container(
                          margin: const EdgeInsets.only(right: 8),
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF3F4F6),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.attach_file, size: 16, color: Color(0xFF6B7280)),
                              const SizedBox(width: 4),
                              Text(
                                att['name']!,
                                style: const TextStyle(fontSize: 12, color: Color(0xFF374151)),
                              ),
                              const SizedBox(width: 4),
                              GestureDetector(
                                onTap: () {
                                  setState(() {
                                    attachments.removeAt(idx);
                                  });
                                },
                                child: const Icon(Icons.close, size: 16, color: Color(0xFFEF4444)),
                              ),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                ),

              // Input
              Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.05),
                  blurRadius: 8,
                  offset: const Offset(0, -2),
                ),
              ],
            ),
            child: Row(
              children: [
                IconButton(
                  icon: const Icon(Icons.attach_file, color: Color(0xFF6B7280)),
                  onPressed: _pickFile,
                ),
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      color: const Color(0xFFF3F4F6),
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: TextField(
                      controller: _messageController,
                      style: const TextStyle(
                        color: Color(0xFF111827),
                        fontSize: 16,
                      ),
                      decoration: const InputDecoration(
                        hintText: 'Type a message...',
                        hintStyle: TextStyle(
                          color: Color(0xFF9CA3AF),
                        ),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.all(Radius.circular(24)),
                          borderSide: BorderSide.none,
                        ),
                        contentPadding: EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 10,
                        ),
                        filled: true,
                        fillColor: Color(0xFFF3F4F6),
                      ),
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
              ),
            ],
          ),

          // Chat history sidebar
          if (showHistory)
            Positioned(
              left: 0,
              top: 0,
              bottom: 0,
              child: GestureDetector(
                onTap: () {},
                child: Container(
                  width: 280,
                  decoration: BoxDecoration(
                    color: const Color(0xFF1F2937),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.3),
                        blurRadius: 10,
                      ),
                    ],
                  ),
                  child: Column(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: const BoxDecoration(
                          border: Border(bottom: BorderSide(color: Color(0xFF374151))),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text(
                              'Chat History',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            Row(
                              children: [
                                IconButton(
                                  icon: const Icon(Icons.refresh, color: Colors.white, size: 20),
                                  onPressed: _loadChatSessions,
                                ),
                                IconButton(
                                  icon: const Icon(Icons.close, color: Colors.white, size: 20),
                                  onPressed: () {
                                    setState(() {
                                      showHistory = false;
                                    });
                                  },
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      Expanded(
                        child: chatSessions.isEmpty
                            ? const Center(
                                child: Text(
                                  'No chats yet',
                                  style: TextStyle(
                                    color: Color(0xFF9CA3AF),
                                    fontSize: 14,
                                  ),
                                ),
                              )
                            : ListView.builder(
                                padding: const EdgeInsets.all(8),
                                itemCount: chatSessions.length,
                                itemBuilder: (context, index) {
                                  final session = chatSessions[index];
                                  final isActive = session['chatId'] == currentChatId;
                                  return GestureDetector(
                                    onTap: () => _loadSession(session),
                                    child: Container(
                                      margin: const EdgeInsets.only(bottom: 4),
                                      padding: const EdgeInsets.all(12),
                                      decoration: BoxDecoration(
                                        color: isActive
                                            ? const Color(0xFF374151)
                                            : Colors.transparent,
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                      child: Row(
                                        children: [
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  session['title'] ?? 'Chat',
                                                  style: const TextStyle(
                                                    color: Colors.white,
                                                    fontSize: 13,
                                                  ),
                                                  maxLines: 1,
                                                  overflow: TextOverflow.ellipsis,
                                                ),
                                                const SizedBox(height: 2),
                                                Text(
                                                  _formatDate(session['updatedAt']),
                                                  style: const TextStyle(
                                                    color: Color(0xFF9CA3AF),
                                                    fontSize: 11,
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                          IconButton(
                                            icon: const Icon(
                                              Icons.delete_outline,
                                              color: Color(0xFF9CA3AF),
                                              size: 18,
                                            ),
                                            onPressed: () => _deleteSession(session['chatId']),
                                          ),
                                        ],
                                      ),
                                    ),
                                  );
                                },
                              ),
                      ),
                    ],
                  ),
                ),
              ),
            ),

          // Backdrop
          if (showHistory)
            Positioned.fill(
              child: GestureDetector(
                onTap: () {
                  setState(() {
                    showHistory = false;
                  });
                },
                child: Container(
                  color: Colors.black.withOpacity(0.3),
                  margin: const EdgeInsets.only(left: 280),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildThinkingIndicator() {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: const Color(0xFFF3F4F6),
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(16),
            topRight: Radius.circular(16),
            bottomLeft: Radius.circular(4),
            bottomRight: Radius.circular(16),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildDot(0),
            const SizedBox(width: 4),
            _buildDot(1),
            const SizedBox(width: 4),
            _buildDot(2),
          ],
        ),
      ),
    );
  }

  Widget _buildDot(int index) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.0, end: 1.0),
      duration: const Duration(milliseconds: 600),
      builder: (context, value, child) {
        final delay = index * 0.2;
        final animValue = ((value + delay) % 1.0);
        final scale = 0.6 + (0.4 * (1 - (animValue - 0.5).abs() * 2));
        return Transform.scale(
          scale: scale,
          child: Container(
            width: 8,
            height: 8,
            decoration: const BoxDecoration(
              color: Color(0xFF9CA3AF),
              shape: BoxShape.circle,
            ),
          ),
        );
      },
      onEnd: () {
        if (mounted && isSending) {
          setState(() {});
        }
      },
    );
  }

  Widget _buildMessage(Map<String, dynamic> message) {
    final isUser = message['role'] == 'user';
    final content = message['content'] ?? '';
    final timestamp = message['timestamp'] ?? '';
    final attachments = message['attachments'] as List<dynamic>?;

    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.75,
        ),
        margin: const EdgeInsets.only(bottom: 12),
        child: Column(
          crossAxisAlignment: isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            // Show attachments if present
            if (attachments != null && attachments.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  alignment: isUser ? WrapAlignment.end : WrapAlignment.start,
                  children: attachments.map((att) {
                    final attMap = att as Map<String, dynamic>;
                    final name = attMap['name'] ?? 'File';
                    return Container(
                      constraints: BoxConstraints(
                        maxWidth: MediaQuery.of(context).size.width * 0.6,
                      ),
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF3F4F6),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: const Color(0xFFE5E7EB)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.attach_file, size: 14, color: Color(0xFF6B7280)),
                          const SizedBox(width: 4),
                          Flexible(
                            child: Text(
                              name,
                              style: const TextStyle(
                                fontSize: 12,
                                color: Color(0xFF374151),
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                ),
              ),
            // Message bubble
            if (content.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: isUser ? const Color(0xFFCB0002) : const Color(0xFFF3F4F6),
                  borderRadius: BorderRadius.only(
                    topLeft: const Radius.circular(16),
                    topRight: const Radius.circular(16),
                    bottomLeft: Radius.circular(isUser ? 16 : 4),
                    bottomRight: Radius.circular(isUser ? 4 : 16),
                  ),
                ),
                child: Text(
                  content,
                  style: TextStyle(
                    fontSize: 15,
                    color: isUser ? Colors.white : const Color(0xFF111827),
                  ),
                ),
              ),
            if (timestamp.isNotEmpty)
              Padding(
                padding: EdgeInsets.only(
                  left: isUser ? 0 : 8,
                  right: isUser ? 8 : 0,
                  top: 4,
                ),
                child: Text(
                  _formatTime(timestamp),
                  style: const TextStyle(
                    fontSize: 10,
                    color: Color(0xFF9CA3AF),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
