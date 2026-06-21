import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;

class PlannerScreen extends StatefulWidget {
  const PlannerScreen({super.key});

  @override
  State<PlannerScreen> createState() => _PlannerScreenState();
}

class _PlannerScreenState extends State<PlannerScreen> {
  static const _bg = Color(0xFFF3F4F6);
  static const _white = Color(0xFFFFFFFF);
  static const _textDark = Color(0xFF111827);
  static const _textLight = Color(0xFF6B7280);
  static const _textPlaceholder = Color(0xFF9CA3AF);
  static const _border = Color(0xFFD1D5DB);
  static const _link = Color(0xFFCB0002);

  bool _isDaily = true;
  double _inspections = 5;
  double _claims = 3;
  int _stormChatGroupCount = 0;
  String? _userId;

  double get _projectedEarnings => (_inspections * 354) + (_claims * 236);

  @override
  void initState() {
    super.initState();
    _loadUserAndFetchGroups();
  }

  Future<void> _loadUserAndFetchGroups() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userStr = prefs.getString('user');
      if (userStr != null) {
        final user = jsonDecode(userStr);
        _userId = user['_id'] ?? user['id'];
        await _fetchStormChatGroups();
      }
    } catch (e) {
      print('Error loading user data: $e');
    }
  }

  Future<void> _fetchStormChatGroups() async {
    if (_userId == null) return;
    
    try {
      final response = await http.get(
        Uri.parse('https://millerstorm.tech/api/storm-chat/groups'),
      );

      if (response.statusCode == 200) {
        final allGroups = json.decode(response.body) as List;
        
        // Filter groups where user is a member
        final userGroups = allGroups.where((group) {
          final members = List<String>.from(group['members'] ?? []);
          return members.contains(_userId);
        }).toList();

        setState(() {
          _stormChatGroupCount = userGroups.length;
        });
      }
    } catch (e) {
      print('Error fetching StormChat groups: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      onWillPop: () async {
        Navigator.pushReplacementNamed(context, '/training');
        return false;
      },
      child: Scaffold(
        backgroundColor: _bg,
        body: SafeArea(
          child: Column(
            children: [
              Expanded(
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.trending_up,
                        size: 100,
                        color: _textLight.withOpacity(0.3),
                      ),
                      const SizedBox(height: 24),
                      const Text(
                        'Coming Soon',
                        style: TextStyle(
                          fontSize: 32,
                          fontWeight: FontWeight.w800,
                          color: _textDark,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 48),
                        child: Text(
                          'Business Planner feature is under development',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 16,
                            color: _textLight,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              _buildBottomNav(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        const Expanded(
          child: Text('Business Planner',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: _textDark),
            overflow: TextOverflow.ellipsis,
          ),
        ),
        const SizedBox(width: 12),
        Container(
          decoration: BoxDecoration(
            color: _white,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: _border),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              GestureDetector(
                onTap: () => setState(() => _isDaily = true),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                  decoration: BoxDecoration(
                    color: _isDaily ? _textDark : Colors.transparent,
                    borderRadius: BorderRadius.circular(24),
                  ),
                  child: Text('Daily', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _isDaily ? _white : _textDark)),
                ),
              ),
              GestureDetector(
                onTap: () => setState(() => _isDaily = false),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                  decoration: BoxDecoration(
                    color: !_isDaily ? _textDark : Colors.transparent,
                    borderRadius: BorderRadius.circular(24),
                  ),
                  child: Text('Weekly', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: !_isDaily ? _white : _textDark)),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildStatCards() {
    return Row(
      children: [
        Expanded(child: _buildStatCard(
          label: 'INSPECTIONS',
          icon: Icons.home_outlined,
          iconColor: _link,
          value: '8',
          total: '10',
          progress: 0.8,
          progressColor: _link,
        )),
        const SizedBox(width: 12),
        Expanded(child: _buildStatCard(
          label: 'CLAIMS',
          icon: Icons.description_outlined,
          iconColor: const Color(0xFFF59E0B),
          value: '4',
          total: '5',
          progress: 0.8,
          progressColor: const Color(0xFFF59E0B),
        )),
      ],
    );
  }

  Widget _buildStatCard({
    required String label,
    required IconData icon,
    required Color iconColor,
    required String value,
    required String total,
    required double progress,
    required Color progressColor,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _textLight, letterSpacing: 0.5)),
              Icon(icon, color: iconColor, size: 22),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(value, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: _textDark)),
              const SizedBox(width: 4),
              Text('/ $total', style: const TextStyle(fontSize: 14, color: _textLight)),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 6,
              backgroundColor: _bg,
              valueColor: AlwaysStoppedAnimation<Color>(progressColor),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRevenueCard() {
    final barHeights = [20.0, 28.0, 22.0, 32.0, 26.0, 30.0, 24.0, 34.0, 28.0, 36.0, 32.0, 38.0];
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: const [
              Text('TOTAL REVENUE CLOSED', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _textLight, letterSpacing: 0.5)),
              Row(
                children: [
                  Icon(Icons.trending_up, color: Colors.green, size: 16),
                  SizedBox(width: 2),
                  Text('+12%', style: TextStyle(fontSize: 13, color: Colors.green, fontWeight: FontWeight.w600)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Text('\$24,500', style: TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: _textDark)),
          const SizedBox(height: 16),
          SizedBox(
            height: 44,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: barHeights.map((h) => Expanded(
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 2),
                  height: h,
                  decoration: BoxDecoration(
                    color: const Color(0xFFBBF7D0),
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              )).toList(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCommissionSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Commission Calculator', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: _textDark)),
        const SizedBox(height: 4),
        const Text('Simulate your earnings pipeline based on average deal sizes.', style: TextStyle(fontSize: 12, color: _textLight)),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: _white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8)],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('PROJECTED EARNINGS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _textLight, letterSpacing: 0.5)),
                  GestureDetector(
                    onTap: () => setState(() { _inspections = 5; _claims = 3; }),
                    child: Row(
                      children: const [
                        Icon(Icons.refresh, color: _link, size: 16),
                        SizedBox(width: 4),
                        Text('Reset', style: TextStyle(fontSize: 13, color: _link, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text('\$${_projectedEarnings.toStringAsFixed(0).replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (m) => '${m[1]},')}',
                style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: _textDark)),
              const SizedBox(height: 20),
              _buildSliderRow(
                number: '1',
                label: 'Inspections Set',
                percent: '15%',
                value: _inspections,
                estLabel: 'Est. ${_inspections.round()} deals',
                onChanged: (v) => setState(() => _inspections = v),
              ),
              const SizedBox(height: 16),
              _buildSliderRow(
                number: '2',
                label: 'Claims Approved',
                percent: '10%',
                value: _claims,
                estLabel: 'Est. ${_claims.round()} deals',
                onChanged: (v) => setState(() => _claims = v),
              ),
              const SizedBox(height: 20),
              const Divider(height: 1, color: _bg),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        Text('WORK ORDERS (15%)', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _textLight, letterSpacing: 0.3)),
                        SizedBox(height: 4),
                        Text('2 Deals', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: _textDark)),
                      ],
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        Text('SIGNATURES (10%)', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _textLight, letterSpacing: 0.3)),
                        SizedBox(height: 4),
                        Text('1 Deal', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: _textDark)),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildSliderRow({
    required String number,
    required String label,
    required String percent,
    required double value,
    required String estLabel,
    required ValueChanged<double> onChanged,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                Text('$number  ', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: _link)),
                Text(label, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: _textDark)),
              ],
            ),
            Text(percent, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: _link)),
          ],
        ),
        SliderTheme(
          data: SliderThemeData(
            trackHeight: 6,
            thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 10),
            overlayShape: const RoundSliderOverlayShape(overlayRadius: 16),
            activeTrackColor: _link,
            inactiveTrackColor: _bg,
            thumbColor: _link,
            overlayColor: _link.withOpacity(0.1),
          ),
          child: Slider(value: value, min: 0, max: 20, onChanged: onChanged),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('0', style: TextStyle(fontSize: 11, color: _textPlaceholder)),
              Text(estLabel, style: const TextStyle(fontSize: 11, color: _textPlaceholder)),
              const Text('20', style: TextStyle(fontSize: 11, color: _textPlaceholder)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildBottomNav() {
    return Container(
      decoration: BoxDecoration(
        color: _white,
        border: Border(top: BorderSide(color: _border, width: 1)),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, -2))],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _navItem(Icons.school_outlined, 'Training', false, '/training'),
              _navItem(Icons.emoji_events_outlined, 'Rankings', false, '/rankings'),
              _navItemActive(),
              _navItemWithBadge(Icons.chat_bubble_outline, 'StormChat', _stormChatGroupCount, '/stormchat'),
            ],
          ),
        ),
      ),
    );
  }

  Widget _navItem(IconData icon, String label, bool active, String route) {
    return Flexible(
      child: GestureDetector(
        onTap: () => Navigator.pushReplacementNamed(context, route),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: active ? _link : _textPlaceholder, size: 24),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 10,
                  color: active ? _link : _textPlaceholder,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _navItemWithBadge(IconData icon, String label, int badge, String route) {
    return Flexible(
      child: GestureDetector(
        onTap: () => Navigator.pushReplacementNamed(context, route),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: _textPlaceholder, size: 24),
              const SizedBox(height: 4),
              Text(
                label,
                style: const TextStyle(
                  fontSize: 10,
                  color: _textPlaceholder,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _navItemActive() {
    return Flexible(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.work_outline, color: _link, size: 24),
            const SizedBox(height: 4),
            const Text(
              'Planner',
              style: TextStyle(
                fontSize: 10,
                color: _link,
                fontWeight: FontWeight.w600,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
