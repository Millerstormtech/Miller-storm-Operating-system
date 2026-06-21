import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'dart:io';
import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:gal/gal.dart';
import 'package:image_editor_plus/image_editor_plus.dart';

class ImageViewerScreen extends StatefulWidget {
  final String imageUrl;
  final String? fileName;
  final String? groupId;
  final String? userId;
  final String? userName;
  final String? userRole;

  const ImageViewerScreen({
    Key? key,
    required this.imageUrl,
    this.fileName,
    this.groupId,
    this.userId,
    this.userName,
    this.userRole,
  }) : super(key: key);

  @override
  State<ImageViewerScreen> createState() => _ImageViewerScreenState();
}

class _ImageViewerScreenState extends State<ImageViewerScreen> {
  final GlobalKey _shareButtonKey = GlobalKey();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          widget.fileName ?? 'Image',
          style: const TextStyle(color: Colors.white, fontSize: 16),
        ),
        actions: [
          IconButton(
            key: _shareButtonKey,
            icon: const Icon(Icons.share, color: Colors.white),
            onPressed: () => _shareImage(context),
          ),
          IconButton(
            icon: const Icon(Icons.download, color: Colors.white),
            onPressed: () => _downloadImage(context),
          ),
          IconButton(
            icon: const Icon(Icons.edit, color: Colors.white),
            onPressed: () => _editImage(),
          ),
        ],
      ),
      body: Center(
        child: InteractiveViewer(
          panEnabled: true,
          boundaryMargin: const EdgeInsets.all(20),
          minScale: 0.5,
          maxScale: 4.0,
          child: Image.network(
            widget.imageUrl.startsWith('http') ? widget.imageUrl : 'https://millerstorm.tech${widget.imageUrl}',
            fit: BoxFit.contain,
            loadingBuilder: (context, child, loadingProgress) {
              if (loadingProgress == null) return child;
              return Center(
                child: CircularProgressIndicator(
                  color: Colors.white,
                  value: loadingProgress.expectedTotalBytes != null
                      ? loadingProgress.cumulativeBytesLoaded / loadingProgress.expectedTotalBytes!
                      : null,
                ),
              );
            },
            errorBuilder: (context, error, stackTrace) {
              return const Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.error, color: Colors.white, size: 64),
                    SizedBox(height: 16),
                    Text(
                      'Failed to load image',
                      style: TextStyle(color: Colors.white),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  void _downloadImage(BuildContext context) async {
    try {
      // Request storage permission
      if (Theme.of(context).platform == TargetPlatform.android) {
        final status = await Permission.storage.request();
        if (!status.isGranted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Storage permission required to download images'),
              backgroundColor: Colors.red,
            ),
          );
          return;
        }
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Downloading image...'),
          backgroundColor: Colors.green,
        ),
      );

      final url = widget.imageUrl.startsWith('http') ? widget.imageUrl : 'https://millerstorm.tech${widget.imageUrl}';
      final response = await http.get(Uri.parse(url));
      await Gal.putImageBytes(
        Uint8List.fromList(response.bodyBytes),
        album: 'StormChat',
      );
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Image saved to Gallery'),
          backgroundColor: Colors.green,
          duration: Duration(seconds: 3),
        ),
      );
    } catch (e) {
      print('Download error: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to download: ${e.toString()}'),
          backgroundColor: Colors.red,
          duration: const Duration(seconds: 3),
        ),
      );
    }
  }

  void _shareImage(BuildContext context) async {
    try {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Preparing to share...'),
          backgroundColor: Colors.blue,
        ),
      );
      
      final url = widget.imageUrl.startsWith('http') ? widget.imageUrl : 'https://millerstorm.tech${widget.imageUrl}';
      print('Sharing image from URL: $url');
      
      // Download image temporarily for sharing
      final response = await http.get(Uri.parse(url));
      print('Response status: ${response.statusCode}');
      print('Response body length: ${response.bodyBytes.length}');
      
      if (response.statusCode == 200) {
        final tempDir = await getTemporaryDirectory();
        final fileName = 'share_image_${DateTime.now().millisecondsSinceEpoch}.jpg';
        final file = File('${tempDir.path}/$fileName');
        print('Writing to file: ${file.path}');
        await file.writeAsBytes(response.bodyBytes);
        print('File exists: ${await file.exists()}');
        print('File length: ${await file.length()}');
        
        // Get share position origin for iOS
        final RenderBox? box = _shareButtonKey.currentContext?.findRenderObject() as RenderBox?;
        final sharePositionOrigin = box == null
            ? null
            : box.localToGlobal(Offset.zero) & box.size;
        
        final result = await Share.shareXFiles(
          [XFile(file.path)],
          text: 'Shared from StormChat',
          sharePositionOrigin: sharePositionOrigin,
        );
        print('Share result: $result');
      }
    } catch (e, stackTrace) {
      print('Share error: $e');
      print('Stack trace: $stackTrace');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to share image: ${e.toString()}'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  void _editImage() async {
    // Store references before any async gap
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);

    try {
      messenger.showSnackBar(
        const SnackBar(
          content: Text('Preparing image...'),
          backgroundColor: Colors.blue,
          duration: Duration(seconds: 1),
        ),
      );

      final url = widget.imageUrl.startsWith('http')
          ? widget.imageUrl
          : 'https://millerstorm.tech${widget.imageUrl}';
      final response = await http.get(Uri.parse(url));
      if (!mounted) return;

      if (response.statusCode != 200) {
        messenger.showSnackBar(
          const SnackBar(
            content: Text('Failed to load image for editing'),
            backgroundColor: Colors.red,
          ),
        );
        return;
      }

      final editedImage = await navigator.push(
        MaterialPageRoute(
          builder: (context) => ImageEditor(image: response.bodyBytes),
        ),
      );
      if (!mounted) return;

      if (editedImage != null) {
        messenger.showSnackBar(
          const SnackBar(
            content: Text('Saving edited image...'),
            backgroundColor: Colors.blue,
            duration: Duration(seconds: 1),
          ),
        );

        // Save to gallery
        await Gal.putImageBytes(editedImage, album: 'StormChat');
        if (!mounted) return;

        // If opened from a chat room, upload and send back as new message
        if (widget.groupId != null && widget.userId != null) {
          try {
            final tempDir = await getTemporaryDirectory();
            final tempFile = File(
              '${tempDir.path}/edited_${DateTime.now().millisecondsSinceEpoch}.jpg',
            );
            await tempFile.writeAsBytes(editedImage);

            final uploadRequest = http.MultipartRequest(
              'POST',
              Uri.parse('https://millerstorm.tech/api/upload-image'),
            );
            uploadRequest.files.add(
              await http.MultipartFile.fromPath('file', tempFile.path),
            );
            final uploadStream = await uploadRequest.send();
            final uploadResponse = await http.Response.fromStream(uploadStream);

            if (!mounted) return;
            if (uploadResponse.statusCode == 200) {
              final uploadData = jsonDecode(uploadResponse.body);
              final uploadedUrl = uploadData['url'];

              await http.post(
                Uri.parse(
                  'https://millerstorm.tech/api/storm-chat/messages/${widget.groupId}',
                ),
                headers: {'Content-Type': 'application/json'},
                body: jsonEncode({
                  'senderId': widget.userId,
                  'senderName': widget.userName,
                  'senderRole': widget.userRole,
                  'message': 'edited_image.jpg',
                  'messageType': 'image',
                  'mediaUrl': uploadedUrl,
                }),
              );
            }
          } catch (e) {
            print('Send to chat error: $e');
          }
        }

        if (!mounted) return;
        messenger.showSnackBar(
          const SnackBar(
            content: Text('Edited image saved & sent to chat!'),
            backgroundColor: Colors.green,
            duration: Duration(seconds: 3),
          ),
        );
      }
    } catch (e) {
      print('Edit error: $e');
      if (!mounted) return;
      messenger.showSnackBar(
        SnackBar(
          content: Text('Failed to edit image: ${e.toString()}'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  void _showMoreOptions(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.grey[900],
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.edit, color: Colors.white),
              title: const Text('Edit', style: TextStyle(color: Colors.white)),
              onTap: () {
                Navigator.pop(context);
                _editImage();
              },
            ),
            ListTile(
              leading: const Icon(Icons.share, color: Colors.white),
              title: const Text('Share', style: TextStyle(color: Colors.white)),
              onTap: () {
                Navigator.pop(context);
                _shareImage(context);
              },
            ),
            ListTile(
              leading: const Icon(Icons.download, color: Colors.white),
              title: const Text('Download', style: TextStyle(color: Colors.white)),
              onTap: () {
                Navigator.pop(context);
                _downloadImage(context);
              },
            ),
            ListTile(
              leading: const Icon(Icons.info, color: Colors.white),
              title: const Text('Image Info', style: TextStyle(color: Colors.white)),
              onTap: () {
                Navigator.pop(context);
                _showImageInfo(context);
              },
            ),
          ],
        ),
      ),
    );
  }

  void _showImageInfo(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: Colors.grey[900],
        title: const Text('Image Info', style: TextStyle(color: Colors.white)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('URL: ${widget.imageUrl}', style: const TextStyle(color: Colors.white70)),
            if (widget.fileName != null)
              Text('Name: ${widget.fileName}', style: const TextStyle(color: Colors.white70)),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close', style: TextStyle(color: Colors.blue)),
          ),
        ],
      ),
    );
  }
}
