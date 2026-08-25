import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../services/api_client.dart';
import 'dart:convert';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:showcaseview/showcaseview.dart';

class AppsToolsItemsScreen extends StatefulWidget {
  const AppsToolsItemsScreen({super.key});

  @override
  State<AppsToolsItemsScreen> createState() => _AppsToolsItemsScreenState();
}

class _AppsToolsItemsScreenState extends State<AppsToolsItemsScreen> with SingleTickerProviderStateMixin {
  Color get _bg => AppColors.bg;
  Color get _white => AppColors.surface;
  static const _primary = Color(0xFFCB0002);
  Color get _textDark => AppColors.textDark;
  Color get _textMedium => AppColors.textLight;
  Color get _textLight => AppColors.textLight;
  Color get _border => AppColors.border;

  // All published items are fetched ONCE and cached here; switching category
  // tabs just filters this list locally (no network round-trip per tab).
  List<dynamic> _allItems = [];
  List<dynamic> _categories = [];
  bool _loading = true;
  late TabController _tabController;
  int _selectedCategoryIndex = 0;

  // Guided tour (Apps & Tools) — mirrors the web "apps-tools" tour. This screen
  // has no search box, so step 1 is dropped: grouped sections (category tabs),
  // one tool card, then a "?" replay button. Auto-starts once per user/device.
  final GlobalKey _kSections = GlobalKey();
  final GlobalKey _kCard = GlobalKey();
  final GlobalKey _kReplay = GlobalKey();
  bool _tourChecked = false;
  static const _tourSeenKey = 'tour_seen_apps_tools_v1';

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

  // Walk the tour: grouped sections (tabs) -> a tool card -> the replay button.
  // Only include a step whose target widget is actually built right now.
  void _startTour(BuildContext context) {
    final keys = <GlobalKey>[];
    if (_categories.isNotEmpty) keys.add(_kSections);
    if (_items.isNotEmpty) keys.add(_kCard);
    keys.add(_kReplay);
    ShowCaseWidget.of(context).startShowCase(keys);
  }

  // First visit only: run the tour once, then remember it per user/device.
  Future<void> _maybeAutoStartTour(BuildContext context) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (prefs.getBool(_tourSeenKey) == true) return;
      await prefs.setBool(_tourSeenKey, true);
      if (!mounted) return;
      _startTour(context);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    // Wrap in ShowCaseWidget so the Apps & Tools tour can spotlight elements.
    return ShowCaseWidget(
      blurValue: 0.4,
      builder: (context) => _buildScaffold(context),
    );
  }

  Widget _buildScaffold(BuildContext context) {
    // Auto-start the tour once per user, after items have loaded.
    if (!_loading && !_tourChecked) {
      _tourChecked = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => _maybeAutoStartTour(context));
    }
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
        title: Text(
          'Apps & Tools',
          style: TextStyle(color: _textDark, fontSize: 18, fontWeight: FontWeight.w700),
        ),
        actions: [
          Showcase(
            key: _kReplay,
            title: 'Replay anytime',
            description: 'This button restarts the tour whenever you want a refresher.',
            child: IconButton(
              icon: Icon(Icons.help_outline, color: _textLight, size: 24),
              tooltip: 'Guided tour',
              onPressed: () => _startTour(context),
            ),
          ),
          const SizedBox(width: 4),
        ],
        bottom: _categories.isEmpty
            ? null
            : PreferredSize(
                preferredSize: const Size.fromHeight(48),
                child: Showcase(
                  key: _kSections,
                  title: 'Grouped by job',
                  description: 'Tools are grouped into sections, so the ones you reach for together sit together.',
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
      ),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: _primary))
                : _categories.isEmpty
                    ? Center(
                        child: Text(
                          'No categories available',
                          style: TextStyle(color: _textLight, fontSize: 14),
                        ),
                      )
                    : _items.isEmpty
                        ? Center(
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
                              final Widget card = Padding(
                                padding: const EdgeInsets.only(bottom: 16),
                                child: _buildItemCard(item),
                              );
                              // Spotlight the first tool card for the tour.
                              if (index == 0) {
                                return Showcase(
                                  key: _kCard,
                                  title: 'One card per tool',
                                  description: 'Each card carries a short description and the links that get you there: the web version, plus the apps for iPhone and Android.',
                                  child: card,
                                );
                              }
                              return card;
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
        border: Border(top: BorderSide(color: _border, width: 1)),
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
                  onTap: () => Navigator.pushReplacementNamed(context, '/rankings'),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.transparent,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.leaderboard_outlined, color: AppColors.textPlaceholder, size: 24),
                        const SizedBox(height: 4),
                        Text('Sales', style: TextStyle(fontSize: 10, color: AppColors.textPlaceholder), textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis),
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
                      children: [
                        Icon(Icons.chat_bubble_outline, color: AppColors.textPlaceholder, size: 24),
                        const SizedBox(height: 4),
                        Text('StormChat', style: TextStyle(fontSize: 10, color: AppColors.textPlaceholder), textAlign: TextAlign.center),
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
                      Text('Tools', style: TextStyle(fontSize: 10, color: _primary, fontWeight: FontWeight.w600), textAlign: TextAlign.center),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 2),
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
                      children: [
                        Icon(Icons.school_outlined, color: AppColors.textPlaceholder, size: 24),
                        const SizedBox(height: 4),
                        Text('Training', style: TextStyle(fontSize: 10, color: AppColors.textPlaceholder), textAlign: TextAlign.center),
                      ],
                    ),
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
                      children: [
                        Icon(Icons.person_outline, color: AppColors.textPlaceholder, size: 24),
                        const SizedBox(height: 4),
                        Text('Profile', style: TextStyle(fontSize: 10, color: AppColors.textPlaceholder), textAlign: TextAlign.center),
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
                    style: TextStyle(
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
                      style: TextStyle(
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
            Icon(
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
