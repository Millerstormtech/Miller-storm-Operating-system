import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../services/api_client.dart';

class ManagerTeamMemberDetailScreen extends StatefulWidget {
  final Map<String, dynamic> member;

  const ManagerTeamMemberDetailScreen({super.key, required this.member});

  @override
  State<ManagerTeamMemberDetailScreen> createState() => _ManagerTeamMemberDetailScreenState();
}

class _ManagerTeamMemberDetailScreenState extends State<ManagerTeamMemberDetailScreen> {
  static const _bg = Color(0xFFF3F4F6);
  static const _white = Color(0xFFFFFFFF);
  static const _primary = Color(0xFFCB0002);
  static const _textDark = Color(0xFF111827);
  static const _textLight = Color(0xFF6B7280);
  static const _textPlaceholder = Color(0xFF9CA3AF);
  static const _border = Color(0xFFD1D5DB);

  bool _isLoading = true;
  bool _showPlan = false;
  Map<String, dynamic>? _businessPlan;
  Map<String, double> _metrics = {};

  @override
  void initState() {
    super.initState();
    _fetchMemberPlan();
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

  Future<void> _fetchMemberPlan() async {
    final mId = _extractId(widget.member);
    if (mId.isEmpty) return;

    try {
      final response = await api.get(Uri.parse('https://millerstorm.tech/api/business-plan?userId=$mId'));
      if (response.statusCode == 200) {
        final dynamic data = jsonDecode(response.body);
        List<dynamic> plans = data is List ? data : [];
        
        final userPlan = plans.firstWhere(
          (p) => _extractId({'id': p['userId']}) == mId, 
          orElse: () => null
        );
        
        if (userPlan != null) {
          setState(() {
            _businessPlan = userPlan['businessPlan'];
            if (_businessPlan != null) {
              _calculateMetrics();
            }
          });
        }
      }
    } catch (e) {
      print('Error fetching plan: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  void _calculateMetrics() {
    if (_businessPlan == null) return;
    
    final incomeGoal = (_businessPlan!['revenueGoal'] ?? 0).toDouble();
    final dealAve = (_businessPlan!['averageDealSize'] ?? 12000).toDouble();

    final dealsPerYear = dealAve > 0 ? (incomeGoal / dealAve).roundToDouble() : 0.0;
    final dealsPerMonth = dealsPerYear / 12;
    final claimsPerYear = (dealsPerYear * 3).roundToDouble();
    final claimsPerMonth = claimsPerYear / 12;
    final inspectionsPerYear = (claimsPerYear * 3).roundToDouble();
    final inspectionsPerMonth = inspectionsPerYear / 12;

    setState(() {
      _metrics = {
        'dealsPerYear': dealsPerYear,
        'dealsPerMonth': dealsPerMonth,
        'claimsPerYear': claimsPerYear,
        'claimsPerMonth': claimsPerMonth,
        'inspectionsPerYear': inspectionsPerYear,
        'inspectionsPerMonth': inspectionsPerMonth,
      };
    });
  }

  Future<void> _savePlan(Map<String, dynamic> updatedPlan) async {
    final mId = _extractId(widget.member);
    try {
      final response = await api.post(
        Uri.parse('https://millerstorm.tech/api/business-plan'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'userId': mId,
          'businessPlan': updatedPlan,
        }),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Plan updated successfully'), backgroundColor: Colors.green),
          );
        }
        setState(() {
          _businessPlan = updatedPlan;
          _calculateMetrics();
        });
      }
    } catch (e) {
      print('Error saving plan: $e');
    }
  }

  void _showEditDialog() {
    final bp = _businessPlan ?? {};
    final incomeController = TextEditingController(text: (bp['revenueGoal'] ?? 100000).toInt().toString());
    final dealAveController = TextEditingController(text: (bp['averageDealSize'] ?? 12000).toInt().toString());
    final daysController = TextEditingController(text: (bp['daysPerWeek'] ?? 5).toInt().toString());

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: _white,
        surfaceTintColor: Colors.transparent,
        title: Text('Edit Plan - ${widget.member['name']}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildDialogField('Income Goal', incomeController, prefix: '\$'),
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
            onPressed: () {
              final incomeGoal = double.tryParse(incomeController.text) ?? 0.0;
              final dealAve = double.tryParse(dealAveController.text) ?? 0.0;
              final days = double.tryParse(daysController.text) ?? 5.0;
              
              final updatedPlan = {
                ...bp,
                'revenueGoal': incomeGoal,
                'averageDealSize': dealAve,
                'daysPerWeek': days,
              };
              
              Navigator.pop(context);
              _savePlan(updatedPlan);
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
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: _textDark),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          widget.member['name'] ?? 'User Details',
          style: const TextStyle(color: _textDark, fontWeight: FontWeight.bold, fontSize: 18),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1.0),
          child: Container(color: _border.withOpacity(0.5), height: 1.0),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildProfileHeader(),
            const SizedBox(height: 24),
            _buildInfoSection(),
            const SizedBox(height: 32),
            _buildPlanToggle(),
            if (_showPlan) ...[
              const SizedBox(height: 20),
              _buildPlanDetails(),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildProfileHeader() {
    final headshotUrl = widget.member['headshotUrl']?.toString() ?? '';
    final fullImageUrl = headshotUrl.isNotEmpty 
        ? (headshotUrl.startsWith('http') ? headshotUrl : 'https://millerstorm.tech$headshotUrl')
        : '';

    return Row(
      children: [
        CircleAvatar(
          radius: 40,
          backgroundColor: _primary.withOpacity(0.1),
          backgroundImage: fullImageUrl.isNotEmpty ? NetworkImage(fullImageUrl) : null,
          child: fullImageUrl.isEmpty ? Text(
            (widget.member['name'] ?? 'U')[0].toUpperCase(),
            style: const TextStyle(color: _primary, fontWeight: FontWeight.bold, fontSize: 32),
          ) : null,
        ),
        const SizedBox(width: 20),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.member['name'] ?? 'Unknown User',
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: _textDark),
              ),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: _primary.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text(
                  'Sales Representative',
                  style: TextStyle(color: _primary, fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildInfoSection() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: _white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10)],
      ),
      child: Column(
        children: [
          _buildInfoRow(Icons.email_outlined, 'Email', widget.member['email'] ?? 'No email'),
          const Divider(height: 24),
          _buildInfoRow(Icons.phone_outlined, 'Phone', widget.member['phone'] ?? 'No phone'),
          const Divider(height: 24),
          _buildInfoRow(Icons.location_on_outlined, 'Territory', widget.member['territory'] ?? 'Not assigned'),
        ],
      ),
    );
  }

  Widget _buildInfoRow(IconData icon, String label, String value) {
    return Row(
      children: [
        Icon(icon, color: _textLight, size: 20),
        const SizedBox(width: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: TextStyle(fontSize: 12, color: _textLight)),
            const SizedBox(height: 2),
            Text(value, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: _textDark)),
          ],
        ),
      ],
    );
  }

  Widget _buildPlanToggle() {
    return GestureDetector(
      onTap: () {
        setState(() => _showPlan = !_showPlan);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        decoration: BoxDecoration(
          color: _white,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8)],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'Show Business Plan',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: _textDark,
              ),
            ),
            Icon(
              _showPlan ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
              color: _textDark,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPlanDetails() {
    if (_isLoading) return const Center(child: CircularProgressIndicator(color: _primary));
    if (_businessPlan == null) {
      return Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(color: _white, borderRadius: BorderRadius.circular(16)),
        child: const Center(child: Text('No business plan found for this user.')),
      );
    }

    final isCommitted = _businessPlan!['committed'] ?? false;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                const Text(
                  'BUSINESS PLAN',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: _textDark, letterSpacing: 1.0),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: isCommitted ? Colors.green.withOpacity(0.1) : Colors.orange.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    isCommitted ? 'COMMITTED' : 'PENDING',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      color: isCommitted ? Colors.green : Colors.orange,
                    ),
                  ),
                ),
              ],
            ),
            TextButton.icon(
              onPressed: _showEditDialog,
              icon: const Icon(Icons.edit, size: 16, color: _primary),
              label: const Text('Edit', style: TextStyle(color: _primary, fontWeight: FontWeight.bold)),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: _white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10)],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Annual Income Goal', style: TextStyle(fontSize: 14, color: _textLight)),
                      const SizedBox(height: 8),
                      Text(
                        '\$${(_businessPlan!['revenueGoal'] ?? 0).toStringAsFixed(0).replaceAllMapped(RegExp(r"(\d{1,3})(?=(\d{3})+(?!\d))"), (Match m) => "${m[1]},")}',
                        style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: _textDark),
                      ),
                    ],
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      const Text('Avg Deal Size', style: TextStyle(fontSize: 14, color: _textLight)),
                      const SizedBox(height: 8),
                      Text(
                        '\$${(_businessPlan!['averageDealSize'] ?? 12000).toStringAsFixed(0).replaceAllMapped(RegExp(r"(\d{1,3})(?=(\d{3})+(?!\d))"), (Match m) => "${m[1]},")}',
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: _textDark),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 24),
              _buildMetricRow('Yearly Targets', [
                {'label': 'DEALS', 'value': _metrics['dealsPerYear']},
                {'label': 'CLAIMS', 'value': _metrics['claimsPerYear']},
                {'label': 'INSPECTS', 'value': _metrics['inspectionsPerYear']},
              ]),
              const Divider(height: 40),
              _buildMetricRow('Monthly Targets', [
                {'label': 'DEALS', 'value': _metrics['dealsPerMonth']},
                {'label': 'CLAIMS', 'value': _metrics['claimsPerMonth']},
                {'label': 'INSPECTS', 'value': _metrics['inspectionsPerMonth']},
              ]),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildMetricRow(String title, List<Map<String, dynamic>> items) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: _textLight)),
        const SizedBox(height: 16),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: items.map((item) {
            final double val = item['value'] ?? 0.0;
            return Column(
              children: [
                Text(
                  val >= 1000 ? '${(val / 1000).toStringAsFixed(1)}k' : val.toStringAsFixed(0),
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: _textDark),
                ),
                const SizedBox(height: 4),
                Text(item['label'], style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: _textLight)),
              ],
            );
          }).toList(),
        ),
      ],
    );
  }
}
