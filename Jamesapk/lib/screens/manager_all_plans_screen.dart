import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class ManagerAllPlansScreen extends StatefulWidget {
  final List<dynamic> teamMembers;
  final Function(double, double) calculateMetrics;
  final Future<void> Function(String, Map<String, dynamic>) onSavePlan;
  final Future<void> Function() onRefresh;

  const ManagerAllPlansScreen({
    super.key,
    required this.teamMembers,
    required this.calculateMetrics,
    required this.onSavePlan,
    required this.onRefresh,
  });

  @override
  State<ManagerAllPlansScreen> createState() => _ManagerAllPlansScreenState();
}

class _ManagerAllPlansScreenState extends State<ManagerAllPlansScreen> {
  static const _bg = Color(0xFFF3F4F6);
  static const _white = Color(0xFFFFFFFF);
  static const _primary = Color(0xFFCB0002);
  static const _textDark = Color(0xFF111827);
  static const _textLight = Color(0xFF6B7280);
  static const _textPlaceholder = Color(0xFF9CA3AF);
  static const _border = Color(0xFFD1D5DB);
  static const _link = Color(0xFFCB0002);

  final TextEditingController _searchController = TextEditingController();
  List<dynamic> _currentMembers = [];
  List<dynamic> _filteredMembers = [];
  Set<String> _expandedReps = {};
  bool _isRefreshing = false;

  @override
  void initState() {
    super.initState();
    _currentMembers = List.from(widget.teamMembers);
    _filteredMembers = _currentMembers;
  }

  @override
  void didUpdateWidget(ManagerAllPlansScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.teamMembers != widget.teamMembers) {
      setState(() {
        _currentMembers = List.from(widget.teamMembers);
        _filterMembers(_searchController.text);
      });
    }
  }

  Future<void> _handleRefresh() async {
    setState(() => _isRefreshing = true);
    await widget.onRefresh();
    setState(() => _isRefreshing = false);
  }

  void _filterMembers(String query) {
    setState(() {
      if (query.isEmpty) {
        _filteredMembers = _currentMembers;
      } else {
        _filteredMembers = _currentMembers
            .where((member) =>
                (member['name'] ?? '').toString().toLowerCase().contains(query.toLowerCase()))
            .toList();
      }
    });
  }

  String _extractId(dynamic member) {
    if (member == null) return '';
    final id = member['id'] ?? member['_id'];
    if (id == null) return '';
    if (id is Map && id.containsKey('\$oid')) {
      return id['\$oid'].toString();
    }
    return id.toString();
  }

  void _showEditDialog(dynamic member) {
    final bp = member['businessPlan'] ?? {};
    final nameController = TextEditingController(text: (bp['revenueGoal'] ?? 100000).toInt().toString());
    final dealAveController = TextEditingController(text: (bp['averageDealSize'] ?? 12000).toInt().toString());
    final daysController = TextEditingController(text: (bp['daysPerWeek'] ?? 5).toInt().toString());

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: _white,
        surfaceTintColor: Colors.transparent,
        title: Text('Edit Plan - ${member['name']}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildDialogField('Income Goal', nameController, prefix: '\$'),
              const SizedBox(height: 16),
              _buildDialogField('Deal Ave', dealAveController, prefix: '\$'),
              const SizedBox(height: 16),
              _buildDialogField('Working Days / Week', daysController),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              final incomeGoal = double.tryParse(nameController.text) ?? 0.0;
              final dealAve = double.tryParse(dealAveController.text) ?? 0.0;
              final days = double.tryParse(daysController.text) ?? 5.0;
              
              final metrics = widget.calculateMetrics(incomeGoal, dealAve);
              final updatedPlan = {
                'revenueGoal': incomeGoal,
                'daysPerWeek': days,
                'territories': [member['territory'] ?? ""],
                'averageDealSize': dealAve,
                'dealsPerYear': metrics['dealsPerYear']?.round(),
                'dealsPerMonth': metrics['dealsPerMonth']?.round(),
                'inspectionsNeeded': metrics['inspectionsPerMonth']?.round(),
                'doorsPerYear': 0,
                'doorsPerDay': 0,
                'committed': bp['committed'] ?? false,
              };

              Navigator.pop(context);
              
              // First, update locally so the UI changes immediately
              setState(() {
                final index = _currentMembers.indexWhere((m) => _extractId(m) == _extractId(member));
                if (index != -1) {
                  _currentMembers[index] = {
                    ..._currentMembers[index],
                    'businessPlan': updatedPlan,
                  };
                  _filterMembers(_searchController.text);
                }
              });

              // Then save to server and do a full refresh
              await widget.onSavePlan(_extractId(member), updatedPlan);
              await _handleRefresh();
            },
            style: ElevatedButton.styleFrom(backgroundColor: _primary, foregroundColor: _white),
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  Widget _buildDialogField(String label, TextEditingController controller, {String? prefix}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _textLight)),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(
            prefixText: prefix,
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _white,
        elevation: 0,
        titleSpacing: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: _textDark),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          'All Team Plans',
          style: TextStyle(color: _textDark, fontSize: 18, fontWeight: FontWeight.w700),
        ),
      ),
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            color: _white,
            child: TextField(
              controller: _searchController,
              onChanged: _filterMembers,
              decoration: InputDecoration(
                hintText: 'Search team members...',
                hintStyle: const TextStyle(color: _textPlaceholder),
                prefixIcon: const Icon(Icons.search, color: _textPlaceholder),
                filled: true,
                fillColor: _bg,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                contentPadding: const EdgeInsets.symmetric(vertical: 0),
              ),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _handleRefresh,
              color: _primary,
              child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: _filteredMembers.length,
                itemBuilder: (context, index) {
                  return _buildRepCard(_filteredMembers[index]);
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRepCard(dynamic member) {
    final bp = member['businessPlan'];
    final metrics = widget.calculateMetrics((bp?['revenueGoal'] ?? 0).toDouble(), (bp?['averageDealSize'] ?? 12000).toDouble());
    final isCommitted = bp?['committed'] ?? false;
    final mId = _extractId(member);
    final isExpanded = _expandedReps.contains(mId);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: _white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8)],
      ),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          key: PageStorageKey(mId),
          onExpansionChanged: (expanded) {
            setState(() {
              if (expanded) {
                _expandedReps.add(mId);
              } else {
                _expandedReps.remove(mId);
              }
            });
          },
          initiallyExpanded: isExpanded,
          tilePadding: const EdgeInsets.all(16),
          title: Row(
            children: [
              CircleAvatar(
                radius: 24,
                backgroundColor: _border.withOpacity(0.3),
                backgroundImage: (member['headshotUrl'] != null && member['headshotUrl'].toString().isNotEmpty)
                  ? NetworkImage(member['headshotUrl'].toString().startsWith('http') 
                      ? member['headshotUrl'].toString() 
                      : 'https://millerstorm.tech${member['headshotUrl']}')
                  : null,
                child: (member['headshotUrl'] == null || member['headshotUrl'].toString().isEmpty) 
                  ? Text(
                      (member['name'] ?? 'U')[0].toUpperCase(),
                      style: const TextStyle(color: _textLight, fontWeight: FontWeight.bold),
                    ) 
                  : null,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(member['name'] ?? 'Unknown Rep', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: _textDark)),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: isCommitted ? Colors.green.withOpacity(0.1) : Colors.amber.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  isCommitted ? 'COMMITTED' : 'DRAFT',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    color: isCommitted ? Colors.green[700] : Colors.amber[800],
                  ),
                ),
              ),
            ],
          ),
          subtitle: Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _buildRepMetric('INCOME GOAL', '\$${(bp?['revenueGoal'] ?? 0).toStringAsFixed(0).replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}'),
                _buildRepMetric('DEAL AVE', '\$${(bp?['averageDealSize'] ?? 12000).toStringAsFixed(0)}', alignEnd: true),
              ],
            ),
          ),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Column(
                children: [
                  const Divider(height: 24),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _buildRepMetric('DEALS / YEAR', metrics['dealsPerYear']!.toStringAsFixed(0)),
                      _buildRepMetric('DEALS / MONTH', metrics['dealsPerMonth']!.toStringAsFixed(2), alignEnd: true),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _buildRepMetric('CLAIMS / YEAR', metrics['claimsPerYear']!.toStringAsFixed(0)),
                      _buildRepMetric('CLAIMS / MONTH', metrics['claimsPerMonth']!.toStringAsFixed(2), alignEnd: true),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _buildRepMetric('INSPECTIONS / YEAR', metrics['inspectionsPerYear']!.toStringAsFixed(0)),
                      _buildRepMetric('INSPECTIONS / MONTH', metrics['inspectionsPerMonth']!.toStringAsFixed(2), alignEnd: true),
                    ],
                  ),
                  const SizedBox(height: 16),
                  const Divider(height: 1),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      TextButton.icon(
                        onPressed: () => _showEditDialog(member),
                        icon: const Icon(Icons.edit_outlined, size: 16),
                        label: const Text('Edit Plan', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                        style: TextButton.styleFrom(foregroundColor: _link),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRepMetric(String label, String value, {Color? color, bool alignEnd = false}) {
    return Expanded(
      child: Column(
        crossAxisAlignment: alignEnd ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w600, color: _textPlaceholder)),
          const SizedBox(height: 4),
          Text(
            value, 
            style: TextStyle(
              fontSize: 14, 
              fontWeight: FontWeight.bold, 
              color: color ?? _textDark,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
