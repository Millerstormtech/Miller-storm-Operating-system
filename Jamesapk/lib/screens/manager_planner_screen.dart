import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../services/api_client.dart';

class ManagerPlannerScreen extends StatefulWidget {
  const ManagerPlannerScreen({super.key});

  @override
  State<ManagerPlannerScreen> createState() => _ManagerPlannerScreenState();
}

class _ManagerPlannerScreenState extends State<ManagerPlannerScreen> {
  static const _bg = Color(0xFFF3F4F6);
  static const _white = Color(0xFFFFFFFF);
  static const _primary = Color(0xFFCB0002);
  static const _textDark = Color(0xFF111827);
  static const _textLight = Color(0xFF6B7280);
  static const _textPlaceholder = Color(0xFF9CA3AF);
  static const _border = Color(0xFFD1D5DB);
  static const _link = Color(0xFFCB0002);

  String? _userId;
  bool _isYearly = true;
  bool _isLoading = true;
  List<dynamic> _teamMembers = [];
  Set<String> _expandedReps = {};
  Map<String, dynamic> _totals = {
    'incomeGoal': 0.0,
    'dealsPerYear': 0.0,
    'dealsPerMonth': 0.0,
    'claimsPerYear': 0.0,
    'claimsPerMonth': 0.0,
    'inspectionsPerYear': 0.0,
    'inspectionsPerMonth': 0.0,
  };

  @override
  void initState() {
    super.initState();
    _loadUserAndFetchData();
  }

  Future<void> _loadUserAndFetchData() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userStr = prefs.getString('user');
      if (userStr != null) {
        final user = jsonDecode(userStr);
        // Ensure _userId is a string and handle MongoDB ID format
        _userId = _extractId(user);
        await _fetchTeamData();
      }
    } catch (e) {
      print('Error loading user data: $e');
      setState(() => _isLoading = false);
    }
  }

  Map<String, double> _calculateMetrics(double incomeGoal, double dealAve) {
    final dealsPerYear = dealAve > 0 ? (incomeGoal / dealAve).roundToDouble() : 0.0;
    final dealsPerMonth = dealsPerYear / 12;
    final claimsPerYear = (dealsPerYear * 3).roundToDouble();
    final claimsPerMonth = claimsPerYear / 12;
    final inspectionsPerYear = (claimsPerYear * 3).roundToDouble();
    final inspectionsPerMonth = inspectionsPerYear / 12;

    return {
      'dealsPerYear': dealsPerYear,
      'dealsPerMonth': dealsPerMonth,
      'claimsPerYear': claimsPerYear,
      'claimsPerMonth': claimsPerMonth,
      'inspectionsPerYear': inspectionsPerYear,
      'inspectionsPerMonth': inspectionsPerMonth,
    };
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

  void _recalculateTotalsFromLocalData() {
    double totalIncome = 0;
    double totalDealsY = 0, totalDealsM = 0;
    double totalClaimsY = 0, totalClaimsM = 0;
    double totalInspectY = 0, totalInspectM = 0;

    for (var member in _teamMembers) {
      final businessPlan = member['businessPlan'];
      if (businessPlan != null && businessPlan['committed'] == true) {
        final incomeGoal = (businessPlan['revenueGoal'] ?? 0).toDouble();
        final dealAve = (businessPlan['averageDealSize'] ?? 12000).toDouble();
        final metrics = _calculateMetrics(incomeGoal, dealAve);

        totalIncome += incomeGoal;
        totalDealsY += metrics['dealsPerYear']!;
        totalDealsM += metrics['dealsPerMonth']!;
        totalClaimsY += metrics['claimsPerYear']!;
        totalClaimsM += metrics['claimsPerMonth']!;
        totalInspectY += metrics['inspectionsPerYear']!;
        totalInspectM += metrics['inspectionsPerMonth']!;
      }
    }

    setState(() {
      _totals = {
        'incomeGoal': totalIncome,
        'dealsPerYear': totalDealsY,
        'dealsPerMonth': totalDealsM,
        'claimsPerYear': totalClaimsY,
        'claimsPerMonth': totalClaimsM,
        'inspectionsPerYear': totalInspectY,
        'inspectionsPerMonth': totalInspectM,
      };
    });
  }

  Future<void> _fetchTeamData({bool silent = false}) async {
    if (_userId == null || _userId!.isEmpty) return;
    if (!silent) setState(() => _isLoading = true);

    try {
      final response = await api.get(Uri.parse('https://millerstorm.tech/api/users'));
      if (response.statusCode == 200) {
        final List<dynamic> allUsers = jsonDecode(response.body);
        
        // Robust filtering for team members
        final team = allUsers.where((u) {
          final mId = _extractId({'id': u['managerId']});
          final role = (u['role'] ?? '').toString();
          return mId == _userId && role == 'sales';
        }).toList();

        final List<dynamic> teamWithPlans = [];
        double totalIncome = 0;
        double totalDealsY = 0, totalDealsM = 0;
        double totalClaimsY = 0, totalClaimsM = 0;
        double totalInspectY = 0, totalInspectM = 0;

        for (var member in team) {
          final mId = _extractId(member);
          if (mId.isEmpty) continue;

          final planRes = await api.get(Uri.parse('https://millerstorm.tech/api/business-plan?userId=$mId'));
          
          Map<String, dynamic>? businessPlan;
          if (planRes.statusCode == 200) {
            final dynamic data = jsonDecode(planRes.body);
            List<dynamic> plans = data is List ? data : [];
            
            // Robust check for the user's specific plan
            final userPlan = plans.firstWhere(
              (p) => _extractId({'id': p['userId']}) == mId, 
              orElse: () => null
            );
            
            if (userPlan != null) {
              businessPlan = userPlan['businessPlan'];
            }
          }

          final memberData = {
            ...member,
            'businessPlan': businessPlan,
          };
          teamWithPlans.add(memberData);

          if (businessPlan != null && businessPlan['committed'] == true) {
            final incomeGoal = (businessPlan['revenueGoal'] ?? 0).toDouble();
            final dealAve = (businessPlan['averageDealSize'] ?? 12000).toDouble();
            final metrics = _calculateMetrics(incomeGoal, dealAve);

            totalIncome += incomeGoal;
            totalDealsY += metrics['dealsPerYear']!;
            totalDealsM += metrics['dealsPerMonth']!;
            totalClaimsY += metrics['claimsPerYear']!;
            totalClaimsM += metrics['claimsPerMonth']!;
            totalInspectY += metrics['inspectionsPerYear']!;
            totalInspectM += metrics['inspectionsPerMonth']!;
          }
        }

        setState(() {
          _teamMembers = teamWithPlans;
          _totals = {
            'incomeGoal': totalIncome,
            'dealsPerYear': totalDealsY,
            'dealsPerMonth': totalDealsM,
            'claimsPerYear': totalClaimsY,
            'claimsPerMonth': totalClaimsM,
            'inspectionsPerYear': totalInspectY,
            'inspectionsPerMonth': totalInspectM,
          };
          _isLoading = false;
        });
      }
    } catch (e) {
      print('Error fetching team data: $e');
      setState(() => _isLoading = false);
    }
  }

  Future<void> _savePlan(String memberId, Map<String, dynamic> updatedPlan) async {
    try {
      final response = await api.post(
        Uri.parse('https://millerstorm.tech/api/business-plan'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'userId': memberId,
          'businessPlan': updatedPlan,
        }),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        // Show success snackbar
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Plan updated successfully'), backgroundColor: Colors.green),
          );
        }

        // Create notification
        try {
          await api.post(
            Uri.parse('https://millerstorm.tech/api/notifications'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'userId': memberId,
              'type': 'plan_updated',
              'title': 'Business Plan Updated',
              'message': 'Your manager updated your business plan.',
              'metadata': {'updatedBy': 'manager', 'businessPlan': updatedPlan}
            }),
          );
        } catch (e) {
          print('Error sending notification: $e');
        }
        
        // Refresh the whole data in the background silently to ensure local state is perfect
        _fetchTeamData(silent: true);
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to update plan: ${response.statusCode}'), backgroundColor: Colors.red),
          );
        }
      }
    } catch (e) {
      print('Error saving plan: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Network error updating plan'), backgroundColor: Colors.red),
        );
      }
    }
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
              
              final metrics = _calculateMetrics(incomeGoal, dealAve);
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

              // 1. Instant local update for the specific member
              setState(() {
                final index = _teamMembers.indexWhere((m) => _extractId(m) == _extractId(member));
                if (index != -1) {
                  _teamMembers[index] = {
                    ..._teamMembers[index],
                    'businessPlan': updatedPlan,
                  };
                  // Recalculate totals immediately without a full fetch
                  _recalculateTotalsFromLocalData();
                }
              });

              // 2. Save to server in background
              await _savePlan(_extractId(member), updatedPlan);
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
    return WillPopScope(
      onWillPop: () async {
        Navigator.pushReplacementNamed(context, '/manager-training');
        return false;
      },
      child: Scaffold(
        backgroundColor: _bg,
        body: SafeArea(
          child: Column(
            children: [
              // Header
              Container(
                width: double.infinity,
                color: _white,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                child: const Text(
                  'Miller Storm Planner Center',
                  textAlign: TextAlign.left,
                  style: TextStyle(color: _textDark, fontSize: 18, fontWeight: FontWeight.w700),
                ),
              ),
              
              Expanded(
                child: _isLoading 
                  ? const Center(child: CircularProgressIndicator(color: _primary))
                  : RefreshIndicator(
                      onRefresh: _fetchTeamData,
                      color: _primary,
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _buildSectionHeader('Team Totals'),
                            _buildTeamTotalsCard(),
                            const SizedBox(height: 32),
                            
                            _buildSectionHeader(_isYearly ? 'Yearly Targets' : 'Monthly Targets'),
                            _buildVolumeTargets(),
                            const SizedBox(height: 32),
                            
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                _buildSectionHeader('Sales Team Plans'),
                                TextButton(
                                  onPressed: () {
                                    Navigator.pushNamed(
                                      context,
                                      '/manager-all-plans',
                                      arguments: {
                                        'teamMembers': _teamMembers,
                                        'calculateMetrics': _calculateMetrics,
                                        'onSavePlan': (String id, Map<String, dynamic> plan) async {
                                          await _savePlan(id, plan);
                                        },
                                        'onRefresh': () async {
                                          await _fetchTeamData(silent: true);
                                        },
                                      },
                                    ).then((_) => _fetchTeamData());
                                  },
                                  child: const Text('View All', style: TextStyle(color: _link, fontWeight: FontWeight.bold)),
                                ),
                              ],
                            ),
                            ..._teamMembers.take(3).map((member) => _buildRepCard(member)).toList(),
                            if (_teamMembers.isEmpty)
                              const Center(child: Padding(padding: EdgeInsets.all(24), child: Text('No team members assigned'))),
                          ],
                        ),
                      ),
                    ),
              ),
              _buildBottomNav(context),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Text(
        title.toUpperCase(),
        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: _textDark, letterSpacing: 1.0),
      ),
    );
  }

  Widget _buildTeamTotalsCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: _white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Total Income Goal', style: TextStyle(fontSize: 14, color: _textLight)),
          const SizedBox(height: 8),
          Text(
            '\$${_totals['incomeGoal'].toStringAsFixed(0).replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
            style: const TextStyle(fontSize: 32, fontWeight: FontWeight.bold, color: _textDark),
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(child: _buildMiniStat('Claims Ratio', '25%', 'Fixed')),
              const SizedBox(width: 16),
              Expanded(child: _buildMiniStat('Inspection Ratio', '30%', 'Fixed')),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMiniStat(String label, String value, String badge) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 12, color: _textLight)),
        const SizedBox(height: 6),
        Row(
          children: [
            Text(value, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: _textDark)),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(border: Border.all(color: _border), borderRadius: BorderRadius.circular(4)),
              child: Text(badge, style: const TextStyle(fontSize: 10, color: _textLight)),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildVolumeTargets() {
    final suffix = _isYearly ? 'Per Year' : 'Per Month';
    final deals = _isYearly ? _totals['dealsPerYear'] : _totals['dealsPerMonth'];
    final claims = _isYearly ? _totals['claimsPerYear'] : _totals['claimsPerMonth'];
    final inspections = _isYearly ? _totals['inspectionsPerYear'] : _totals['inspectionsPerMonth'];

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(color: _border.withOpacity(0.2), borderRadius: BorderRadius.circular(10)),
          child: Row(
            children: [
              Expanded(child: _buildToggleBtn('Yearly', _isYearly, () => setState(() => _isYearly = true))),
              Expanded(child: _buildToggleBtn('Monthly', !_isYearly, () => setState(() => _isYearly = false))),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(child: _buildTargetBox('DEALS', deals, suffix)),
            const SizedBox(width: 8),
            Expanded(child: _buildTargetBox('CLAIMS', claims, suffix)),
            const SizedBox(width: 8),
            Expanded(child: _buildTargetBox('INSPECTS', inspections, suffix)),
          ],
        ),
      ],
    );
  }

  Widget _buildToggleBtn(String label, bool active, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: active ? _white : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          boxShadow: active ? [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 4)] : null,
        ),
        child: Text(label, textAlign: TextAlign.center, style: TextStyle(fontSize: 13, fontWeight: active ? FontWeight.bold : FontWeight.w500, color: active ? _textDark : _textLight)),
      ),
    );
  }

  Widget _buildTargetBox(String label, double value, String suffix) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 16),
      decoration: BoxDecoration(color: _white, borderRadius: BorderRadius.circular(12), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 6)]),
      child: Column(
        children: [
          Text(
            value >= 1000 ? '${(value/1000).toStringAsFixed(1)}k' : value.toStringAsFixed(value % 1 == 0 ? 0 : 1),
            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: _textDark),
          ),
          const SizedBox(height: 4),
          Text(label, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: _textLight)),
          Text(suffix.toUpperCase(), style: const TextStyle(fontSize: 8, color: _textPlaceholder)),
        ],
      ),
    );
  }

  Widget _buildRepCard(dynamic member) {
    final bp = member['businessPlan'];
    final metrics = _calculateMetrics((bp?['revenueGoal'] ?? 0).toDouble(), (bp?['averageDealSize'] ?? 12000).toDouble());
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
                  // Row 2: Deals
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _buildRepMetric('DEALS / YEAR', metrics['dealsPerYear']!.toStringAsFixed(0)),
                      _buildRepMetric('DEALS / MONTH', metrics['dealsPerMonth']!.toStringAsFixed(2), alignEnd: true),
                    ],
                  ),
                  const SizedBox(height: 16),
                  // Row 3: Claims
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _buildRepMetric('CLAIMS / YEAR', metrics['claimsPerYear']!.toStringAsFixed(0)),
                      _buildRepMetric('CLAIMS / MONTH', metrics['claimsPerMonth']!.toStringAsFixed(2), alignEnd: true),
                    ],
                  ),
                  const SizedBox(height: 16),
                  // Row 4: Inspections
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

  Widget _buildBottomNav(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: _white,
        border: const Border(top: BorderSide(color: _border, width: 1)),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, -2))],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _navItem(Icons.school_outlined, 'Training', '/manager-training', context),
              _navItem(Icons.chat_bubble_outline, 'StormChat', '/manager-stormchat', context),
              _navItem(Icons.apps_outlined, 'Apps & Tools', '/manager-apps-tools-items', context),
              _navItem(Icons.group_outlined, 'View Team', '/manager-view-team', context),
              _navItem(Icons.person_outline, 'Profile', '/manager-profile', context),
            ],
          ),
        ),
      ),
    );
  }

  Widget _navItem(IconData icon, String label, String route, BuildContext context) {
    return Expanded(
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => Navigator.pushReplacementNamed(context, route),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          color: Colors.transparent,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: _textPlaceholder, size: 24),
              const SizedBox(height: 4),
              Text(label, style: const TextStyle(fontSize: 10, color: _textPlaceholder), textAlign: TextAlign.center),
            ],
          ),
        ),
      ),
    );
  }

  Widget _navItemActive(IconData icon, String label) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(color: _primary.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: _primary, size: 24),
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(fontSize: 10, color: _primary, fontWeight: FontWeight.w600), textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}
