import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_client.dart';
import '../services/dmo.dart';
import '../theme/app_theme.dart';
import '../widgets/role_bottom_nav.dart';

// The DMO (Jay, 2026-10-02), phone version of src/portals/shared/dmo/DmoPage.tsx:
// your own monthly goal and weekly commitment against your real numbers, and
// for leaders the roll-up of everyone below them, red first. One screen for
// every sales role. What each viewer sees is decided by /api/dmo (a rep only
// ever receives themselves), and every colour comes from the server's rules.

const _api = 'https://millerstorm.tech/api/dmo';
const Color _primary = Color(0xFFCB0002);

Map<String, dynamic> _map(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
List<Map<String, dynamic>> _list(dynamic v) => v is List ? v.map(_map).toList() : <Map<String, dynamic>>[];
String _str(dynamic v) => (v ?? '').toString();

// ---- small shared pieces ----------------------------------------------------

Widget _card({required Widget child, Color? border, EdgeInsets padding = const EdgeInsets.fromLTRB(16, 15, 16, 15)}) => Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: border ?? AppColors.border),
      ),
      child: child,
    );

Text _cap(String s) => Text(
      s.toUpperCase(),
      style: TextStyle(fontSize: 11, letterSpacing: 1.1, fontWeight: FontWeight.w600, color: AppColors.textLight),
    );

Widget _dot(Color c) => Container(width: 9, height: 9, decoration: BoxDecoration(color: c, shape: BoxShape.circle));

Widget _chip(Map chip) {
  final c = dmoColour(chip['colour'], AppColors.textPlaceholder);
  return Row(mainAxisSize: MainAxisSize.min, children: [
    _dot(c),
    const SizedBox(width: 6),
    Text(dmoChipLabel(chip), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c)),
  ]);
}

ButtonStyle _quietStyle({bool small = false}) => OutlinedButton.styleFrom(
      foregroundColor: _primary,
      side: BorderSide(color: AppColors.border),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      padding: small ? const EdgeInsets.symmetric(horizontal: 10, vertical: 2) : const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      minimumSize: small ? const Size(0, 30) : const Size(0, 38),
      tapTargetSize: small ? MaterialTapTargetSize.shrinkWrap : MaterialTapTargetSize.padded,
      textStyle: TextStyle(fontSize: small ? 12 : 13, fontWeight: FontWeight.w600),
    );

ButtonStyle get _mainStyle => ElevatedButton.styleFrom(
      backgroundColor: _primary,
      foregroundColor: Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
    );

/// One committed number against what was done: "12 / 20 (pace 8)" and a bar
/// with a mark where the person should be today.
Widget _barRow(Map bar) {
  final field = _str(bar['field']);
  final actual = dmoNum(bar['actual']), target = dmoNum(bar['target']), pace = dmoNum(bar['pace']);
  final colour = dmoColour(bar['colour'], AppColors.textPlaceholder);
  final width = target > 0 ? (actual / target).clamp(0, 1).toDouble() : 1.0;
  final paceAt = target > 0 ? (pace / target).clamp(0, 1).toDouble() : 0.0;
  return Padding(
    padding: const EdgeInsets.only(top: 10),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(dmoFieldLabels[field] ?? field, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.textDark)),
        const SizedBox(width: 8),
        Expanded(
          child: Text.rich(
            TextSpan(style: TextStyle(fontSize: 13, color: AppColors.textLight), children: [
              TextSpan(text: dmoField(field, actual), style: TextStyle(fontWeight: FontWeight.w700, color: colour)),
              TextSpan(text: ' / ${dmoField(field, target)}'),
              TextSpan(text: ' (pace ${dmoField(field, pace)})', style: TextStyle(color: AppColors.textPlaceholder)),
            ]),
            textAlign: TextAlign.right,
          ),
        ),
      ]),
      const SizedBox(height: 5),
      ClipRRect(
        borderRadius: BorderRadius.circular(4),
        child: SizedBox(
          height: 8,
          child: LayoutBuilder(
            builder: (context, box) => Stack(children: [
              Positioned.fill(child: ColoredBox(color: AppColors.surfaceAlt)),
              Positioned(left: 0, top: 0, bottom: 0, width: box.maxWidth * width, child: ColoredBox(color: colour)),
              if (pace > 0 && paceAt < 1)
                Positioned(
                  left: box.maxWidth * paceAt,
                  top: 0,
                  bottom: 0,
                  width: 2,
                  child: ColoredBox(color: AppColors.textDark.withOpacity(0.45)),
                ),
            ]),
          ),
        ),
      ),
    ]),
  );
}

/// What someone committed to, with any Team Lead change shown next to the
/// original ("~~100~~ 150 (changed by Gunner)").
Widget _commitment(Map c, Map names) {
  final now = _map(c['commitment']), original = _map(c['original']);
  final adjustments = _list(c['adjustments']);
  final away = c['away'] is Map ? _map(c['away']) : null;
  return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    for (final f in dmoWeeklyFields)
      Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(dmoFieldLabels[f]!, style: TextStyle(fontSize: 13, color: AppColors.textLight)),
          const SizedBox(width: 8),
          Expanded(child: () {
            final changed = dmoNum(original[f]) != dmoNum(now[f]);
            if (!changed) {
              return Text(dmoField(f, now[f]),
                  textAlign: TextAlign.right, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.textDark));
            }
            final by = adjustments.lastWhere((a) => a['field'] == f, orElse: () => const {});
            final who = by.isEmpty ? 'your Team Lead' : _str(names[by['byUserId']]).isEmpty ? 'your Team Lead' : _str(names[by['byUserId']]);
            return Text.rich(
              TextSpan(style: TextStyle(fontSize: 13, color: AppColors.textDark), children: [
                TextSpan(
                    text: dmoField(f, original[f]),
                    style: TextStyle(color: AppColors.textPlaceholder, decoration: TextDecoration.lineThrough)),
                const TextSpan(text: ' '),
                TextSpan(text: dmoField(f, now[f]), style: const TextStyle(fontWeight: FontWeight.w700)),
                TextSpan(text: ' (changed by $who)', style: TextStyle(color: AppColors.textPlaceholder)),
              ]),
              textAlign: TextAlign.right,
            );
          }()),
        ]),
      ),
    if (away != null)
      Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Text(
          'Away ${dmoDayLabel(_str(away['from']))} to ${dmoDayLabel(_str(away['to']))}${_str(away['reason']).isNotEmpty ? ' (${away['reason']})' : ''}',
          style: TextStyle(fontSize: 13, color: AppColors.textPlaceholder),
        ),
      ),
  ]);
}

// ---- the screen -------------------------------------------------------------

class DmoScreen extends StatefulWidget {
  const DmoScreen({super.key});

  @override
  State<DmoScreen> createState() => _DmoScreenState();
}

class _DmoScreenState extends State<DmoScreen> {
  bool _loading = true;
  bool _failed = false;
  String _role = '';
  String _variant = '';
  Map<String, dynamic>? _dmo;
  // A team (Branch Manager) or branch (leadership) card tapped to narrow the list.
  String? _filter;

  @override
  void initState() {
    super.initState();
    _loadRole();
    _load();
  }

  Future<void> _loadRole() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userStr = prefs.getString('user');
      if (userStr != null && mounted) setState(() => _role = _str(jsonDecode(userStr)['role']));
    } catch (_) {}
  }

  Future<void> _load() async {
    try {
      final res = await api.get(Uri.parse(_api));
      if (res.statusCode != 200) throw Exception('status ${res.statusCode}');
      final json = _map(jsonDecode(res.body));
      if (!mounted) return;
      setState(() {
        _variant = _str(json['variant']);
        _dmo = json['dmo'] is Map ? _map(json['dmo']) : null;
        _failed = false;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() { _failed = true; _loading = false; });
    }
  }

  Future<void> _open(Widget form) async {
    final saved = await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => form));
    if (saved == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    final title = (_variant.isNotEmpty ? _variant : _role) == 'c-level' ? 'DMO' : 'My DMO';
    return AnimatedBuilder(
      animation: themeController,
      builder: (context, _) => Scaffold(
        backgroundColor: AppColors.bg,
        drawer: const RoleBottomNav(active: 'dmo'),
        appBar: AppBar(
          backgroundColor: _primary,
          elevation: 0,
          iconTheme: const IconThemeData(color: Colors.white),
          title: Text(title, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
        ),
        body: RefreshIndicator(
          color: _primary,
          onRefresh: _load,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 30),
            children: _body(),
          ),
        ),
      ),
    );
  }

  List<Widget> _body() {
    if (_loading) {
      return [
        Padding(
          padding: const EdgeInsets.only(top: 60),
          child: Column(children: [
            const CircularProgressIndicator(color: _primary),
            const SizedBox(height: 16),
            Text('Loading your DMO...', style: TextStyle(color: AppColors.textLight)),
          ]),
        ),
      ];
    }
    final dmo = _dmo;
    if (_failed || dmo == null) {
      return [
        _card(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(_failed ? 'The DMO could not load' : 'The DMO is for the sales team',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.textDark)),
            const SizedBox(height: 6),
            Text(_failed ? 'Pull down to refresh. If it keeps happening, tell an admin.' : 'Your account has no DMO of its own.',
                style: TextStyle(fontSize: 14, color: AppColors.textLight)),
            if (_failed) ...[
              const SizedBox(height: 10),
              OutlinedButton(style: _quietStyle(), onPressed: _load, child: const Text('Try again')),
            ],
          ]),
        ),
      ];
    }

    final clock = _map(dmo['clock']);
    final weekOf = _str(clock['weekOf']);
    final me = dmo['me'] is Map ? _map(dmo['me']) : null;
    final level = _str(_map(dmo['scope'])['level']);
    final leaders = level == 'team' || level == 'branch' || level == 'company';
    final total = dmo['total'] is Map ? _map(dmo['total']) : null;
    final slipping = _list(dmo['slipping']);
    final groups = _list(dmo['groups']);
    final names = _map(dmo['names']);
    final people = _list(dmo['people']);
    final shown = _filter == null
        ? people
        : people.where((p) => _str(level == 'company' ? p['branch'] : p['team']) == _filter).toList();
    final canAdjust = _variant == 'sales-team-lead' || _variant == 'branch-manager';

    const gap = SizedBox(height: 16);
    return [
      Text('Week of ${dmoDayLabel(weekOf)} to ${dmoDayLabel(dmoAddDays(weekOf, 6))}',
          style: TextStyle(fontSize: 13, color: AppColors.textLight)),
      gap,
      if (me != null) ...[..._myDmo(me, names), gap],
      if (leaders && total != null) ...[
        _cap(level == 'team' ? 'My team' : level == 'branch' ? 'My branch' : 'Company'),
        const SizedBox(height: 8),
        _groupCard(total,
            title: level == 'team' ? 'Team ${total['key']}' : level == 'branch' ? _str(total['key']) : 'Miller Storm'),
        gap,
      ],
      if (slipping.isNotEmpty) ...[_slipping(slipping), gap],
      if (groups.isNotEmpty) ...[
        Row(children: [
          Expanded(child: _cap(level == 'company' ? 'Branches' : 'Teams')),
          if (_filter != null)
            OutlinedButton(style: _quietStyle(small: true), onPressed: () => setState(() => _filter = null), child: const Text('Show everyone')),
        ]),
        const SizedBox(height: 8),
        for (final g in groups) ...[
          _groupCard(
            g,
            title: level == 'company' ? _str(g['key']) : 'Team ${g['key']}',
            ownerLabel: level == 'company' && _str(g['owner']).isNotEmpty ? 'Branch Manager: ${g['owner']}' : null,
            active: _filter == _str(g['key']),
            onTap: () => setState(() => _filter = _filter == _str(g['key']) ? null : _str(g['key'])),
          ),
          const SizedBox(height: 11),
        ],
        const SizedBox(height: 5),
      ],
      if (leaders) ...[
        _cap('${_filter != null ? (level == 'company' ? _filter : 'Team $_filter') : 'Everyone'}, red first'),
        const SizedBox(height: 8),
        if (shown.isEmpty)
          _card(child: Text('Nobody here yet.', style: TextStyle(fontSize: 14, color: AppColors.textLight)))
        else
          for (final p in shown) ...[
            _personCard(p, canAdjust: canAdjust && _str(p['userId']) != _str(me?['userId'])),
            const SizedBox(height: 11),
          ],
      ],
    ];
  }

  // ---- my own DMO -----------------------------------------------------------

  Widget _dueBanner(String text, bool overdue, VoidCallback onTap) => Padding(
        padding: const EdgeInsets.only(bottom: 11),
        // Button under the text: beside it, a phone squeezes the sentence into three lines.
        child: _card(
          border: overdue ? dmoRed : _primary,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(text, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: overdue ? dmoRed : AppColors.textDark)),
            const SizedBox(height: 10),
            ElevatedButton(style: _mainStyle, onPressed: onTap, child: const Text('Fill it in')),
          ]),
        ),
      );

  List<Widget> _myDmo(Map<String, dynamic> me, Map names) {
    final w = _map(me['weeklyForm']);
    final m = _map(me['monthlyForm']);
    final chip = _map(me['chip']);
    final minimum = _map(me['minimum']);
    final thisWeek = _map(me['thisWeek']);
    final thisMonth = _map(me['thisMonth']);
    final wState = _str(w['state']), mState = _str(m['state']);
    final weekOf = _str(thisWeek['weekOf']);
    final plan = thisMonth['plan'] is Map ? _map(thisMonth['plan']) : null;
    final income = thisMonth['income'] is Map ? _map(thisMonth['income']) : null;
    final weekCommitment = w['commitment'] is Map ? _map(w['commitment']) : null;
    void weekly() => _open(DmoWeeklyFormScreen(me: me));
    void monthly() => _open(DmoMonthlyFormScreen(me: me));

    Widget box(String label, String value) => Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 9),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), border: Border.all(color: AppColors.border)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: TextStyle(fontSize: 12, color: AppColors.textPlaceholder)),
            Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.textDark)),
          ]),
        );
    Widget or() => Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Center(child: Text('OR', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textPlaceholder))),
        );

    return [
      if (mState == 'due' || mState == 'overdue')
        _dueBanner(
          mState == 'overdue'
              ? 'Your ${dmoMonthLabel(_str(m['month']))} DMO is late.'
              : 'Your ${dmoMonthLabel(_str(m['month']))} DMO is due before midnight on the 1st.',
          mState == 'overdue',
          monthly,
        ),
      if (wState == 'due' || wState == 'overdue')
        _dueBanner(
          wState == 'overdue' ? 'Your weekly DMO was due Friday at 1:00 PM.' : 'Your weekly DMO is due ${dmoTimeLabel(_str(w['due']))}.',
          wState == 'overdue',
          weekly,
        ),

      // Jay's minimum: 100 doors OR 1 claim OR a $40K month, separate from the bars.
      _card(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [Expanded(child: _cap('Weekly minimum')), _chip(chip)]),
          const SizedBox(height: 10),
          box('Doors', '${dmoCount(minimum['doors'])} / $kMinWeeklyDoors'),
          or(),
          box('Claims filed', '${dmoCount(minimum['claims'])} / $kMinWeeklyClaims'),
          or(),
          box('Month average (last 90 days)', '${dmoMoney(minimum['monthlyContractAverage'])} / \$40K'),
          if (chip['state'] != 'met' && chip['state'] != 'at-contract' && dmoNum(chip['doorsPace']) > 0)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('Pace for today: ${dmoCount(dmoNum(chip['doorsPace']).round())} doors',
                  style: TextStyle(fontSize: 12, color: AppColors.textPlaceholder)),
            ),
        ]),
      ),
      const SizedBox(height: 11),

      _card(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            _cap('This week'),
            const SizedBox(width: 10),
            Expanded(
              child: Text('${dmoDayLabel(weekOf)} to ${dmoDayLabel(dmoAddDays(weekOf, 6))}',
                  textAlign: TextAlign.right, style: TextStyle(fontSize: 12, color: AppColors.textPlaceholder)),
            ),
          ]),
          if (thisWeek['commitment'] is Map)
            for (final b in _list(thisWeek['bars'])) _barRow(b)
          else
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text("No commitment for this week. Your weekly DMO on Friday sets next week's.",
                  style: TextStyle(fontSize: 14, color: AppColors.textLight)),
            ),
        ]),
      ),
      const SizedBox(height: 11),

      _card(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: _cap(dmoMonthLabel(_str(thisMonth['month'])))),
            if (plan != null) OutlinedButton(style: _quietStyle(small: true), onPressed: monthly, child: const Text('Edit')),
          ]),
          if (plan != null) ...[
            const SizedBox(height: 8),
            Text.rich(TextSpan(style: TextStyle(fontSize: 13, color: AppColors.textLight), children: [
              const TextSpan(text: 'Income goal '),
              TextSpan(text: dmoMoney(plan['incomeGoal']), style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.textDark)),
              if (income != null)
                TextSpan(
                    text: ', which needs ${dmoPlural(income['roofsNeeded'], 'roof')} and ${dmoPlural(income['claimsNeeded'], 'claim')}'),
            ])),
            for (final b in _list(thisMonth['bars'])) _barRow(b),
          ] else
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(
                _str(thisMonth['month']).compareTo(kFirstDmoMonth) < 0
                    ? 'Monthly DMOs start in ${dmoMonthName(kFirstDmoMonth)}.'
                    : 'No monthly DMO for this month yet.',
                style: TextStyle(fontSize: 14, color: AppColors.textLight),
              ),
            ),
        ]),
      ),
      const SizedBox(height: 11),

      _card(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: _cap('Next week (${dmoDayLabel(_str(w['forWeekOf']))})')),
            const SizedBox(width: 8),
            Text(dmoFormLabel(wState),
                style: TextStyle(fontSize: 12, color: wState == 'overdue' ? dmoRed : AppColors.textPlaceholder)),
          ]),
          const SizedBox(height: 10),
          if (weekCommitment != null)
            _commitment(weekCommitment, names)
          else
            Text(wState == 'not-open' ? 'Your weekly DMO opens Thursday and is due Friday at 1:00 PM.' : 'Not sent yet.',
                style: TextStyle(fontSize: 14, color: AppColors.textLight)),
          if (wState != 'not-open' && (weekCommitment == null || w['canAdjust'] == true))
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: OutlinedButton(
                style: _quietStyle(),
                onPressed: weekly,
                child: Text(weekCommitment != null ? 'Edit' : 'Fill in your weekly DMO'),
              ),
            ),
          if ((mState == 'done' || mState == 'late') && _str(m['month']) != _str(thisMonth['month']))
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text('${dmoMonthLabel(_str(m['month']))} DMO sent.', style: TextStyle(fontSize: 13, color: AppColors.textPlaceholder)),
            ),
        ]),
      ),
    ];
  }

  // ---- leaders --------------------------------------------------------------

  Widget _groupCard(Map<String, dynamic> g, {required String title, String? ownerLabel, bool active = false, VoidCallback? onTap}) {
    final colour = dmoColour(g['colour'], AppColors.textPlaceholder);
    final counted = dmoNum(g['counted']);
    final next = _map(_map(g['nextWeek'])['commitment']);
    final bars = _list(_map(g['thisWeek'])['bars']);
    final card = _card(
      border: active ? _primary : null,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: Text(title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.textDark))),
          const SizedBox(width: 10),
          Padding(
            padding: const EdgeInsets.only(top: 3),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              _dot(colour),
              const SizedBox(width: 6),
              Text(counted > 0 ? '${dmoCount(g['green'])} / ${dmoCount(counted)} green' : 'No reps past ramp',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: colour)),
            ]),
          ),
        ]),
        if (ownerLabel != null)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(ownerLabel, style: TextStyle(fontSize: 12, color: AppColors.textPlaceholder)),
          ),
        const SizedBox(height: 8),
        Wrap(spacing: 14, runSpacing: 4, children: [
          _stat('Weekly DMOs', '${dmoCount(g['weeklyDone'])} / ${dmoCount(g['members'])}'),
          if (g['monthlyDue'] == true) _stat('Monthly', '${dmoCount(g['monthlyDone'])} / ${dmoCount(g['members'])}'),
        ]),
        if (bars.isNotEmpty)
          for (final b in bars) _barRow(b)
        else
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Text('No commitments for this week yet.', style: TextStyle(fontSize: 13, color: AppColors.textPlaceholder)),
          ),
        Container(
          margin: const EdgeInsets.only(top: 10),
          padding: const EdgeInsets.only(top: 9),
          width: double.infinity,
          decoration: BoxDecoration(border: Border(top: BorderSide(color: AppColors.border))),
          child: Text(
            'Next week so far (${dmoCount(_map(g['nextWeek'])['submitted'])} sent): ${dmoPlural(next['doors'], 'door')}, '
            '${dmoPlural(next['claims'], 'claim')}, ${dmoPlural(next['contracts'], 'contract')}, ${dmoMoney(next['contractDollars'])}',
            style: TextStyle(fontSize: 12, color: AppColors.textPlaceholder),
          ),
        ),
      ]),
    );
    if (onTap == null) return card;
    return GestureDetector(onTap: onTap, behavior: HitTestBehavior.opaque, child: card);
  }

  Widget _stat(String label, String value) => Text.rich(TextSpan(
        style: TextStyle(fontSize: 13, color: AppColors.textLight),
        children: [
          TextSpan(text: '$label '),
          TextSpan(text: value, style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.textDark)),
        ],
      ));

  // Every red team, and who owns fixing it (leadership only).
  Widget _slipping(List<Map<String, dynamic>> slipping) => _card(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _cap('Slipping'),
          for (final g in slipping)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 9),
              decoration: BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.border))),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Team ${g['key']}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textDark)),
                const SizedBox(height: 2),
                Text(
                  '${dmoCount(g['green'])} / ${dmoCount(g['counted'])} green. Team Lead: ${g['owner']}'
                  '${_str(g['branchOwner']).isNotEmpty && g['branchOwner'] != g['owner'] ? '. Branch Manager: ${g['branchOwner']}' : ''}',
                  style: TextStyle(fontSize: 13, color: AppColors.textLight),
                ),
              ]),
            ),
        ]),
      );

  // One person in a leader's list: the web's table row, as a card.
  Widget _personCard(Map<String, dynamic> p, {required bool canAdjust}) {
    final week = _map(p['thisWeek']);
    final actual = _map(week['actual']);
    final bars = _list(week['bars']);
    final form = _map(p['weeklyForm']);
    final next = form['commitment'] is Map ? _map(form['commitment']) : null;
    final nextCommitment = _map(next?['commitment']);
    final away = next?['away'] is Map ? _map(next!['away']) : null;
    final changeable = canAdjust && next != null && form['canAdjust'] == true;
    final overdue = form['state'] == 'overdue';

    Widget cell(String field) {
      final bar = bars.where((b) => b['field'] == field).firstOrNull;
      return Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(dmoFieldLabels[field]!, style: TextStyle(fontSize: 11, color: AppColors.textPlaceholder)),
          const SizedBox(height: 2),
          Row(children: [
            if (bar != null) ...[_dot(dmoColour(bar['colour'], AppColors.textPlaceholder)), const SizedBox(width: 6)],
            Flexible(
              child: Text(
                bar != null ? '${dmoField(field, bar['actual'])} / ${dmoField(field, bar['target'])}' : dmoField(field, actual[field]),
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.textDark),
              ),
            ),
          ]),
        ]),
      );
    }

    return _card(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(_str(p['name']), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textDark)),
              Text(_str(p['team']).isNotEmpty ? _str(p['team']) : 'No team',
                  style: TextStyle(fontSize: 12, color: AppColors.textPlaceholder)),
            ]),
          ),
          const SizedBox(width: 10),
          Padding(padding: const EdgeInsets.only(top: 2), child: _chip(_map(p['chip']))),
        ]),
        const SizedBox(height: 10),
        Row(children: [cell('doors'), const SizedBox(width: 10), cell('claims')]),
        const SizedBox(height: 8),
        Row(children: [cell('contracts'), const SizedBox(width: 10), cell('contractDollars')]),
        Container(
          margin: const EdgeInsets.only(top: 10),
          padding: const EdgeInsets.only(top: 9),
          width: double.infinity,
          decoration: BoxDecoration(border: Border(top: BorderSide(color: AppColors.border))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text.rich(TextSpan(style: TextStyle(fontSize: 13, color: AppColors.textLight), children: [
              const TextSpan(text: 'Weekly DMO: '),
              TextSpan(
                  text: dmoFormLabel(_str(form['state'])),
                  style: TextStyle(fontWeight: FontWeight.w600, color: overdue ? dmoRed : AppColors.textDark)),
            ])),
            if (_map(p['monthlyForm'])['state'] == 'overdue')
              Text('Monthly not done', style: const TextStyle(fontSize: 12, color: dmoRed)),
            const SizedBox(height: 4),
            Text.rich(TextSpan(style: TextStyle(fontSize: 13, color: AppColors.textLight), children: [
              const TextSpan(text: 'Next week: '),
              TextSpan(
                text: next != null
                    ? '${dmoPlural(nextCommitment['doors'], 'door')}, ${dmoPlural(nextCommitment['claims'], 'claim')}'
                    : '–',
                style: TextStyle(fontWeight: FontWeight.w600, color: AppColors.textDark),
              ),
            ])),
            if (next != null && _list(next['adjustments']).isNotEmpty)
              Text('changed', style: TextStyle(fontSize: 12, color: AppColors.textPlaceholder)),
            if (away != null)
              Text('away ${dmoDayLabel(_str(away['from']))} to ${dmoDayLabel(_str(away['to']))}',
                  style: TextStyle(fontSize: 12, color: AppColors.textPlaceholder)),
            if (changeable)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: OutlinedButton(
                  style: _quietStyle(small: true),
                  onPressed: () => _open(DmoAdjustScreen(person: p)),
                  child: const Text('Adjust'),
                ),
              ),
          ]),
        ),
      ]),
    );
  }
}

// ---- the forms ----------------------------------------------------------------

/// Sends a form and pops `true` on success; otherwise returns the server's message.
Future<String?> _post(String path, Map<String, dynamic> body) async {
  try {
    final res = await api.post(Uri.parse('$_api/$path'),
        headers: {'Content-Type': 'application/json'}, body: jsonEncode(body));
    if (res.statusCode == 200) return null;
    try {
      final err = _str(_map(jsonDecode(res.body))['error']);
      return err.isNotEmpty ? err : 'Could not save';
    } catch (_) {
      return 'Could not save';
    }
  } catch (_) {
    return 'Could not save';
  }
}

/// The web reads an empty box as 0 (JavaScript's Number("")); so does this.
num _value(TextEditingController c) => num.tryParse(c.text.trim()) ?? 0;

String _start(dynamic n) {
  final v = dmoNum(n);
  return v == v.roundToDouble() ? v.round().toString() : v.toString();
}

class _NumberField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final bool money;
  final bool enabled;
  final String? hint;
  final ValueChanged<String>? onChanged;
  const _NumberField(this.label, this.controller, {this.money = false, this.enabled = true, this.hint, this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.textDark)),
      const SizedBox(height: 5),
      TextField(
        controller: controller,
        enabled: enabled,
        onChanged: onChanged,
        keyboardType: TextInputType.numberWithOptions(decimal: money),
        inputFormatters: [money ? FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')) : FilteringTextInputFormatter.digitsOnly],
        style: TextStyle(fontSize: 16, color: AppColors.textDark),
        decoration: InputDecoration(
          isDense: true,
          prefixText: money ? '\$ ' : null,
          contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 11),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide(color: AppColors.border)),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: _primary)),
        ),
      ),
      if (hint != null)
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(hint!, style: TextStyle(fontSize: 12, color: AppColors.textPlaceholder)),
        ),
    ]);
  }
}

Widget _pair(Widget a, Widget b) => Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Expanded(child: a),
      const SizedBox(width: 12),
      Expanded(child: b),
    ]);

Widget _formPage(String title, List<Widget> children) => AnimatedBuilder(
      animation: themeController,
      builder: (context, _) => Scaffold(
        backgroundColor: AppColors.bg,
        appBar: AppBar(
          backgroundColor: _primary,
          elevation: 0,
          iconTheme: const IconThemeData(color: Colors.white),
          title: Text(title, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
        ),
        body: ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 40), children: children),
      ),
    );

Widget _errorText(String error) => error.isEmpty
    ? const SizedBox.shrink()
    : Padding(padding: const EdgeInsets.only(top: 12), child: Text(error, style: const TextStyle(fontSize: 14, color: dmoRed)));

/// The weekly DMO: this week's recap, next week's commitment, and away days.
class DmoWeeklyFormScreen extends StatefulWidget {
  final Map<String, dynamic> me;
  const DmoWeeklyFormScreen({super.key, required this.me});

  @override
  State<DmoWeeklyFormScreen> createState() => _DmoWeeklyFormScreenState();
}

class _DmoWeeklyFormScreenState extends State<DmoWeeklyFormScreen> {
  late final Map<String, dynamic> _form = _map(widget.me['weeklyForm']);
  late final Map<String, TextEditingController> _values;
  late bool _away;
  late String _awayFrom;
  late String _awayTo;
  late final TextEditingController _reason;
  bool _saving = false;
  String _error = '';

  Map<String, dynamic>? get _sent => _form['commitment'] is Map ? _map(_form['commitment']) : null;
  bool get _locked => _sent != null && _form['canAdjust'] != true;

  @override
  void initState() {
    super.initState();
    final recap = _map(widget.me['thisWeek'])['commitment'];
    final start = _sent != null
        ? _map(_sent!['commitment'])
        : recap is Map
            ? _map(recap['commitment'])
            : {'doors': kMinWeeklyDoors, 'claims': kMinWeeklyClaims, 'contracts': 0, 'contractDollars': 0};
    _values = {for (final f in dmoWeeklyFields) f: TextEditingController(text: _start(start[f]))};
    final away = _sent?['away'] is Map ? _map(_sent!['away']) : null;
    final forWeekOf = _str(_form['forWeekOf']);
    _away = away != null;
    _awayFrom = away != null ? _str(away['from']) : forWeekOf;
    _awayTo = away != null ? _str(away['to']) : dmoAddDays(forWeekOf, 6);
    _reason = TextEditingController(text: away != null ? _str(away['reason']) : '');
  }

  @override
  void dispose() {
    for (final c in _values.values) {
      c.dispose();
    }
    _reason.dispose();
    super.dispose();
  }

  Future<void> _pick(bool from) async {
    final current = DateTime.tryParse(from ? _awayFrom : _awayTo) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: current,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked == null) return;
    final day = '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
    setState(() => from ? _awayFrom = day : _awayTo = day);
  }

  Future<void> _save() async {
    setState(() { _saving = true; _error = ''; });
    final error = await _post('weekly', {
      for (final f in dmoWeeklyFields) f: _value(_values[f]!),
      'away': _away ? {'from': _awayFrom, 'to': _awayTo, 'reason': _reason.text} : null,
    });
    if (!mounted) return;
    if (error == null) {
      Navigator.pop(context, true);
    } else {
      setState(() { _saving = false; _error = error; });
    }
  }

  Widget _dateButton(String label, String day, bool from) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: TextStyle(fontSize: 13, color: AppColors.textDark)),
        const SizedBox(height: 5),
        OutlinedButton(
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.textDark,
            side: BorderSide(color: AppColors.border),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            minimumSize: const Size.fromHeight(44),
            alignment: Alignment.centerLeft,
          ),
          onPressed: _locked ? null : () => _pick(from),
          child: Text(dmoDayLabel(day), style: const TextStyle(fontSize: 15)),
        ),
      ]);

  @override
  Widget build(BuildContext context) {
    final me = widget.me;
    final thisWeek = _map(me['thisWeek']);
    final recap = thisWeek['commitment'] is Map ? _map(_map(thisWeek['commitment'])['commitment']) : null;
    final actual = _map(thisWeek['actual']);
    final forWeekOf = _str(_form['forWeekOf']);

    return _formPage('Weekly DMO', [
      Text('Due ${dmoTimeLabel(_str(_form['due']))}', style: TextStyle(fontSize: 12, color: AppColors.textPlaceholder)),
      const SizedBox(height: 14),
      _cap('This week so far'),
      const SizedBox(height: 6),
      if (recap != null)
        for (final f in dmoWeeklyFields)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(children: [
              Text(dmoFieldLabels[f]!, style: TextStyle(fontSize: 13, color: AppColors.textLight)),
              const SizedBox(width: 8),
              Expanded(
                child: Text.rich(
                  TextSpan(style: TextStyle(fontSize: 13, color: AppColors.textLight), children: [
                    TextSpan(text: 'committed ${dmoField(f, recap[f])}, '),
                    TextSpan(text: 'did ${dmoField(f, actual[f])}', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.textDark)),
                  ]),
                  textAlign: TextAlign.right,
                ),
              ),
            ]),
          )
      else
        Text(
          'No commitment for this week. So far: ${dmoPlural(actual['doors'], 'door')}, ${dmoPlural(actual['claims'], 'claim')}, '
          '${dmoPlural(actual['contracts'], 'contract')}, ${dmoMoney(actual['contractDollars'])}.',
          style: TextStyle(fontSize: 13, color: AppColors.textPlaceholder),
        ),
      const SizedBox(height: 18),
      _cap('Next week, ${dmoDayLabel(forWeekOf)} to ${dmoDayLabel(dmoAddDays(forWeekOf, 6))}'),
      const SizedBox(height: 8),
      _pair(_NumberField('Doors', _values['doors']!, enabled: !_locked), _NumberField('Claims', _values['claims']!, enabled: !_locked)),
      const SizedBox(height: 12),
      _pair(_NumberField('Contracts', _values['contracts']!, enabled: !_locked),
          _NumberField(r'Contract $', _values['contractDollars']!, money: true, enabled: !_locked)),
      if (_form['floorExempt'] != true && _error.isEmpty)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text('Your minimum is $kMinWeeklyDoors doors or $kMinWeeklyClaims claim a week. You can always commit to more.',
              style: TextStyle(fontSize: 12, color: AppColors.textPlaceholder)),
        ),
      const SizedBox(height: 10),
      InkWell(
        onTap: _locked ? null : () => setState(() => _away = !_away),
        child: Row(children: [
          Checkbox(value: _away, activeColor: _primary, onChanged: _locked ? null : (v) => setState(() => _away = v == true)),
          Expanded(child: Text("I'll be away (vacation, out of town)", style: TextStyle(fontSize: 14, color: AppColors.textDark))),
        ]),
      ),
      if (_away) ...[
        const SizedBox(height: 4),
        _pair(_dateButton('From', _awayFrom, true), _dateButton('To', _awayTo, false)),
        const SizedBox(height: 12),
        Text('Reason', style: TextStyle(fontSize: 13, color: AppColors.textDark)),
        const SizedBox(height: 5),
        TextField(
          controller: _reason,
          enabled: !_locked,
          maxLength: 200,
          style: TextStyle(fontSize: 16, color: AppColors.textDark),
          decoration: InputDecoration(
            isDense: true,
            counterText: '',
            contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 11),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide(color: AppColors.border)),
          ),
        ),
      ],
      _errorText(_error),
      const SizedBox(height: 16),
      Wrap(spacing: 10, runSpacing: 10, crossAxisAlignment: WrapCrossAlignment.center, children: [
        if (_locked)
          Text("Next week's numbers locked at 5:00 PM Friday.", style: TextStyle(fontSize: 13, color: AppColors.textLight))
        else
          ElevatedButton(
            style: _mainStyle,
            onPressed: _saving ? null : _save,
            child: Text(_saving ? 'Saving...' : _sent != null ? 'Save changes' : 'Submit'),
          ),
        OutlinedButton(style: _quietStyle(), onPressed: () => Navigator.pop(context, false), child: const Text('Close')),
      ]),
    ]);
  }
}

/// The monthly DMO: the income goal, Jay's calculator, and the month's numbers.
class DmoMonthlyFormScreen extends StatefulWidget {
  final Map<String, dynamic> me;
  const DmoMonthlyFormScreen({super.key, required this.me});

  @override
  State<DmoMonthlyFormScreen> createState() => _DmoMonthlyFormScreenState();
}

class _DmoMonthlyFormScreenState extends State<DmoMonthlyFormScreen> {
  late final Map<String, dynamic> _form = _map(widget.me['monthlyForm']);
  late final Map<String, dynamic>? _plan = _form['plan'] is Map ? _map(_form['plan']) : null;
  late final _income = TextEditingController(text: _plan != null ? _start(_plan['incomeGoal']) : '');
  late final _commission =
      TextEditingController(text: _start(_plan != null ? _plan['commissionPerRoof'] : kDefaultCommissionPerRoof));
  late final _doors = TextEditingController(text: _plan != null ? _start(_plan['doors']) : '');
  late final _claims = TextEditingController(text: _plan != null ? _start(_plan['claims']) : '');
  late final _dollars = TextEditingController(text: _plan != null ? _start(_plan['contractDollars']) : '');
  // Until the person types their own claims number, it follows the calculator.
  late bool _claimsTouched = _plan != null;
  bool _saving = false;
  String _error = '';

  DmoIncomePlan? get _calc => dmoIncomePlan(_value(_income), _value(_commission), dmoDaysInMonth(_str(_form['month'])));

  void _follow() {
    final calc = _calc;
    if (!_claimsTouched && calc != null) _claims.text = '${calc.claimsNeeded}';
    setState(() {});
  }

  @override
  void dispose() {
    for (final c in [_income, _commission, _doors, _claims, _dollars]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    setState(() { _saving = true; _error = ''; });
    final error = await _post('monthly', {
      'incomeGoal': _value(_income),
      'commissionPerRoof': _value(_commission),
      'doors': _value(_doors),
      'claims': _value(_claims),
      'contractDollars': _value(_dollars),
    });
    if (!mounted) return;
    if (error == null) {
      Navigator.pop(context, true);
    } else {
      setState(() { _saving = false; _error = error; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final calc = _calc;
    return _formPage('Monthly DMO', [
      Text('Monthly DMO: ${dmoMonthLabel(_str(_form['month']))}',
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.textDark)),
      const SizedBox(height: 2),
      Text('Due before midnight on the 1st', style: TextStyle(fontSize: 12, color: AppColors.textPlaceholder)),
      const SizedBox(height: 14),
      // One under the other: side by side, the longer label wraps and the boxes don't line up.
      _NumberField('Monthly income goal', _income, money: true, onChanged: (_) => _follow()),
      const SizedBox(height: 12),
      _NumberField('Average commission per roof', _commission,
          money: true, hint: 'About \$5,000 for a solo deal', onChanged: (_) => _follow()),
      if (calc != null)
        Container(
          margin: const EdgeInsets.only(top: 12),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: AppColors.border),
          ),
          child: Text.rich(
            TextSpan(style: TextStyle(fontSize: 14, height: 1.5, color: AppColors.textDark), children: [
              TextSpan(text: '${dmoMoney(_value(_income))} / ${dmoMoney(_value(_commission))} per roof = '),
              TextSpan(text: '${calc.roofsNeeded} roofs', style: const TextStyle(fontWeight: FontWeight.w700)),
              const TextSpan(text: '. About half of claims become roofs, so you need '),
              TextSpan(text: '${calc.claimsNeeded} claims', style: const TextStyle(fontWeight: FontWeight.w700)),
              TextSpan(text: ' (about ${calc.weeklyClaimsLabel} a week).'),
            ]),
          ),
        ),
      const SizedBox(height: 14),
      _pair(
        _NumberField('Doors this month', _doors),
        _NumberField('Claims this month', _claims, onChanged: (_) => setState(() => _claimsTouched = true)),
      ),
      const SizedBox(height: 12),
      _NumberField(r'Contract $ this month', _dollars, money: true),
      _errorText(_error),
      const SizedBox(height: 16),
      Wrap(spacing: 10, runSpacing: 10, children: [
        ElevatedButton(
          style: _mainStyle,
          onPressed: _saving ? null : _save,
          child: Text(_saving ? 'Saving...' : _plan != null ? 'Save changes' : 'Submit'),
        ),
        OutlinedButton(style: _quietStyle(), onPressed: () => Navigator.pop(context, false), child: const Text('Close')),
      ]),
    ]);
  }
}

/// A Team Lead or Branch Manager changes someone's numbers for next week,
/// until Friday 5:00 PM. The person sees both what they committed and the change.
class DmoAdjustScreen extends StatefulWidget {
  final Map<String, dynamic> person;
  const DmoAdjustScreen({super.key, required this.person});

  @override
  State<DmoAdjustScreen> createState() => _DmoAdjustScreenState();
}

class _DmoAdjustScreenState extends State<DmoAdjustScreen> {
  late final Map<String, TextEditingController> _values;
  bool _saving = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    final c = _map(_map(_map(widget.person['weeklyForm'])['commitment'])['commitment']);
    _values = {for (final f in dmoWeeklyFields) f: TextEditingController(text: _start(c[f]))};
  }

  @override
  void dispose() {
    for (final c in _values.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    setState(() { _saving = true; _error = ''; });
    final error = await _post('adjust', {
      'userId': _str(widget.person['userId']),
      for (final f in dmoWeeklyFields) f: _value(_values[f]!),
    });
    if (!mounted) return;
    if (error == null) {
      Navigator.pop(context, true);
    } else {
      setState(() { _saving = false; _error = error; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return _formPage('Adjust next week', [
      Text(
        "Change ${widget.person['name']}'s numbers for next week. They'll see what they committed and what you changed it to.",
        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textDark),
      ),
      const SizedBox(height: 14),
      _pair(_NumberField('Doors', _values['doors']!), _NumberField('Claims', _values['claims']!)),
      const SizedBox(height: 12),
      _pair(_NumberField('Contracts', _values['contracts']!), _NumberField(r'Contract $', _values['contractDollars']!, money: true)),
      _errorText(_error),
      const SizedBox(height: 16),
      Wrap(spacing: 10, runSpacing: 10, children: [
        ElevatedButton(style: _mainStyle, onPressed: _saving ? null : _save, child: Text(_saving ? 'Saving...' : 'Save')),
        OutlinedButton(style: _quietStyle(), onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
      ]),
    ]);
  }
}
