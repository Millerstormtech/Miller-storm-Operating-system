import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

class ManagerAppsToolsDetailScreen extends StatelessWidget {
  const ManagerAppsToolsDetailScreen({super.key});

  static const _bg = Color(0xFFF3F4F6);
  static const _white = Color(0xFFFFFFFF);
  static const _primary = Color(0xFFCB0002);
  static const _textDark = Color(0xFF111827);
  static const _textMedium = Color(0xFF374151);
  static const _textLight = Color(0xFF6B7280);

  Future<void> _launchUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = ModalRoute.of(context)?.settings.arguments as Map<String, dynamic>?;
    
    if (item == null) {
      return Scaffold(
        backgroundColor: _bg,
        appBar: AppBar(
          backgroundColor: _white,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back, color: _textDark),
            onPressed: () => Navigator.pop(context),
          ),
        ),
        body: const Center(child: Text('No data available')),
      );
    }

    final imageUrl = item['imageUrl']?.toString() ?? '';
    final fullImageUrl = imageUrl.startsWith('http') 
        ? imageUrl 
        : 'https://millerstorm.tech$imageUrl';
    final title = item['title']?.toString() ?? 'Untitled';
    final description = item['description']?.toString() ?? '';
    final webLink = item['webLink']?.toString() ?? '';
    final appStoreLink = item['appStoreLink']?.toString() ?? '';
    final link = item['link']?.toString() ?? '';

    return Scaffold(
      backgroundColor: _bg,
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 200,
            pinned: true,
            backgroundColor: _white,
            leading: Container(
              margin: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: _white,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.1),
                    blurRadius: 8,
                  ),
                ],
              ),
              child: IconButton(
                icon: const Icon(Icons.arrow_back, color: _textDark),
                onPressed: () => Navigator.pop(context),
              ),
            ),
            flexibleSpace: FlexibleSpaceBar(
              background: Stack(
                fit: StackFit.expand,
                children: [
                  if (imageUrl.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 60, 16, 16),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(16),
                        child: Image.network(
                          fullImageUrl,
                          fit: BoxFit.contain,
                          errorBuilder: (context, error, stackTrace) {
                            return Container(
                              color: _bg,
                              child: const Center(
                                child: Icon(Icons.image_not_supported, color: _textLight, size: 60),
                              ),
                            );
                          },
                        ),
                      ),
                    )
                  else
                    Container(
                      margin: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: _bg,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: const Center(
                        child: Icon(Icons.apps, color: _textLight, size: 60),
                      ),
                    ),
                ],
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Container(
              decoration: BoxDecoration(
                color: _white,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
              ),
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                        color: _textDark,
                        height: 1.2,
                      ),
                    ),
                    if (description.isNotEmpty) ...[
                      const SizedBox(height: 20),
                      const Text(
                        'Description',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: _textDark,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        description,
                        style: const TextStyle(
                          fontSize: 15,
                          color: _textMedium,
                          height: 1.5,
                        ),
                      ),
                    ],
                    const SizedBox(height: 24),
                    if (webLink.isNotEmpty || appStoreLink.isNotEmpty || link.isNotEmpty) ...[
                      const Text(
                        'Available On',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: _textDark,
                        ),
                      ),
                      const SizedBox(height: 12),
                      if (webLink.isNotEmpty)
                        _buildLinkButton(context, 'Open Website', webLink, Icons.language),
                      if (link.isNotEmpty && link != webLink)
                        _buildLinkButton(context, 'View Link', link, Icons.link),
                      if (appStoreLink.isNotEmpty)
                        _buildLinkButton(context, 'Download on App Store', appStoreLink, Icons.apple),
                    ],
                    SizedBox(height: MediaQuery.of(context).padding.bottom + 40),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLinkButton(BuildContext context, String label, String url, IconData icon) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: SizedBox(
        width: double.infinity,
        height: 56,
        child: ElevatedButton.icon(
          onPressed: () => _launchUrl(url),
          icon: Icon(icon, size: 22),
          label: Text(
            label,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          ),
          style: ElevatedButton.styleFrom(
            backgroundColor: _primary,
            foregroundColor: _white,
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
      ),
    );
  }
}
