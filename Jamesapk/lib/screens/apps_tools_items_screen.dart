import 'package:flutter/material.dart';
import '../services/api_client.dart';
import 'dart:convert';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:url_launcher/url_launcher.dart';

class AppsToolsItemsScreen extends StatefulWidget {
  const AppsToolsItemsScreen({super.key});

  @override
  State<AppsToolsItemsScreen> createState() => _AppsToolsItemsScreenState();
}

class _AppsToolsItemsScreenState extends State<AppsToolsItemsScreen> with SingleTickerProviderStateMixin {
  static const _bg = Color(0xFFF3F4F6);
  static const _white = Color(0xFFFFFFFF);
  static const _primary = Color(0xFFCB0002);
  static const _textDark = Color(0xFF111827);
  static const _textMedium = Color(0xFF374151);
  static const _textLight = Color(0xFF6B7280);
  static const _border = Color(0xFFD1D5DB);

  // All published items are fetched ONCE and cached here; switching category
  // tabs just filters this list locally (no network round-trip per tab).
  List<dynamic> _allItems = [];
  List<dynamic> _categories = [];
  bool _loading = true;
  late TabController _tabController;
  int _selectedCategoryIndex = 0;

  // Items for the currently selected category — computed from the cache.
  List<dynamic> get _items {
    if (_categories.isEmpty) return const [];
    final slug = _categories[_selectedCategoryIndex]['slug'];
    return _allItems.where((item) => item['category'] == slug).toList();
  }

  @override
  void initState() {
    super.initState();
    _fetchCategories();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _fetchCategories() async {
    try {
      final response = await api.get(
        Uri.parse('https://millerstorm.tech/api/apps-tools/categories'),
      );

      if (response.statusCode == 200) {
        final allCategories = json.decode(response.body) as List;
        final publishedCategories = allCategories
            .where((cat) => cat['status'] == 'published')
            .toList();

        if (publishedCategories.isNotEmpty) {
          setState(() {
            _categories = publishedCategories;
            _tabController = TabController(length: publishedCategories.length, vsync: this);
            _tabController.addListener(() {
              // Tab switch only re-filters the cached items — no network call.
              if (!_tabController.indexIsChanging) {
                setState(() => _selectedCategoryIndex = _tabController.index);
              }
            });
          });
          _fetchAllItems();
        } else {
          setState(() {
            _loading = false;
          });
        }
      }
    } catch (e) {
      print('Error fetching categories: $e');
      setState(() {
        _loading = false;
      });
    }
  }

  // Fetch every published item ONCE. Category tabs filter this cache locally.
  Future<void> _fetchAllItems() async {
    try {
      final response = await api.get(
        Uri.parse('https://millerstorm.tech/api/apps-tools?published=true'),
      );

      if (response.statusCode == 200) {
        final allItems = json.decode(response.body) as List;
        setState(() {
          _allItems = allItems;
          _loading = false;
        });
      } else {
        setState(() => _loading = false);
      }
    } catch (e) {
      print('Error fetching items: $e');
      setState(() => _loading = false);
    }
  }

  Future<void> _launchUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      onWillPop: () async {
        Navigator.pushReplacementNamed(context, '/courses');
        return false;
      },
      child: Scaffold(
        backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _white,
        elevation: 0,
        title: const Text(
          'Apps & Tools',
          style: TextStyle(color: _textDark, fontSize: 18, fontWeight: FontWeight.w700),
        ),
        bottom: _categories.isEmpty
            ? null
            : PreferredSize(
                preferredSize: const Size.fromHeight(48),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: TabBar(
                    controller: _tabController,
                    labelColor: _primary,
                    unselectedLabelColor: _textLight,
                    indicatorColor: _primary,
                    labelStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                    isScrollable: true,
                    tabAlignment: TabAlignment.start,
                    padding: EdgeInsets.zero,
                    labelPadding: const EdgeInsets.symmetric(horizontal: 16),
                    indicatorPadding: EdgeInsets.zero,
                    tabs: _categories.map((category) {
                      return Tab(text: category['name']);
                    }).toList(),
                  ),
                ),
              ),
      ),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: _primary))
                : _categories.isEmpty
                    ? const Center(
                        child: Text(
                          'No categories available',
                          style: TextStyle(color: _textLight, fontSize: 14),
                        ),
                      )
                    : _items.isEmpty
                        ? const Center(
                            child: Text(
                              'No items available',
                              style: TextStyle(color: _textLight, fontSize: 14),
                            ),
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.all(16),
                            itemCount: _items.length,
                            itemBuilder: (context, index) {
                              final item = _items[index];
                              return Padding(
                                padding: const EdgeInsets.only(bottom: 16),
                                child: _buildItemCard(item),
                              );
                            },
                          ),
          ),
          _buildBottomNav(context),
        ],
      ),
      ),
    );
  }

  Widget _buildBottomNav(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: _white,
        border: const Border(top: BorderSide(color: _border, width: 1)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 8,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: GestureDetector(
                  onTap: () => Navigator.pushReplacementNamed(context, '/courses'),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.transparent,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: const [
                        Icon(Icons.school_outlined, color: Color(0xFF9CA3AF), size: 24),
                        SizedBox(height: 4),
                        Text('Training', style: TextStyle(fontSize: 10, color: Color(0xFF9CA3AF)), textAlign: TextAlign.center),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 2),
              Expanded(
                child: GestureDetector(
                  onTap: () => Navigator.pushReplacementNamed(context, '/stormchat'),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.transparent,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: const [
                        Icon(Icons.chat_bubble_outline, color: Color(0xFF9CA3AF), size: 24),
                        SizedBox(height: 4),
                        Text('StormChat', style: TextStyle(fontSize: 10, color: Color(0xFF9CA3AF)), textAlign: TextAlign.center),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 2),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  decoration: BoxDecoration(
                    color: _primary.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: const [
                      Icon(Icons.apps_outlined, color: _primary, size: 24),
                      SizedBox(height: 4),
                      Text('Apps & Tools', style: TextStyle(fontSize: 10, color: _primary, fontWeight: FontWeight.w600), textAlign: TextAlign.center),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 2),
              Expanded(
                child: GestureDetector(
                  onTap: () => Navigator.pushReplacementNamed(context, '/profile'),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.transparent,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: const [
                        Icon(Icons.person_outline, color: Color(0xFF9CA3AF), size: 24),
                        SizedBox(height: 4),
                        Text('Profile', style: TextStyle(fontSize: 10, color: Color(0xFF9CA3AF)), textAlign: TextAlign.center),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildItemCard(dynamic item) {
    if (item == null) return const SizedBox.shrink();
    
    final imageUrl = item['imageUrl']?.toString() ?? '';
    final fullImageUrl = imageUrl.startsWith('http') 
        ? imageUrl 
        : 'https://millerstorm.tech$imageUrl';
    final title = item['title']?.toString() ?? 'Untitled';
    final description = item['description']?.toString() ?? '';

    return GestureDetector(
      onTap: () {
        Navigator.pushNamed(
          context,
          '/apps-tools-detail',
          arguments: item,
        );
      },
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: _white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.04),
              blurRadius: 8,
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: _primary.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: imageUrl.isNotEmpty
                  ? ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: CachedNetworkImage(
                        imageUrl: fullImageUrl,
                        width: 56,
                        height: 56,
                        fit: BoxFit.cover,
                        memCacheWidth: 112,
                        fadeInDuration: const Duration(milliseconds: 150),
                        errorWidget: (context, url, error) => const Icon(
                          Icons.apps_outlined,
                          color: _primary,
                          size: 28,
                        ),
                      ),
                    )
                  : const Icon(
                      Icons.apps_outlined,
                      color: _primary,
                      size: 28,
                    ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: _textDark,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (description.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      description,
                      style: const TextStyle(
                        fontSize: 14,
                        color: _textLight,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            const Icon(
              Icons.chevron_right,
              color: _textLight,
              size: 24,
            ),
          ],
        ),
      ),
    );
  }
}
