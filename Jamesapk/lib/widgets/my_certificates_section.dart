import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../services/api_client.dart';
import '../theme/app_theme.dart';

/// My Profile: the certificates this person has earned, each saved or shared as
/// the same PDF they were emailed (2026-09-13). The list and the file come from
/// the same endpoints as the web's My Certificates card, so the two agree.
class MyCertificatesSection extends StatefulWidget {
  const MyCertificatesSection({super.key});

  @override
  State<MyCertificatesSection> createState() => _MyCertificatesSectionState();
}

class _MyCertificatesSectionState extends State<MyCertificatesSection> {
  static const _primary = Color(0xFFCB0002);
  static const _base = 'https://millerstorm.tech';
  static const _months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  List<Map<String, dynamic>>? _items;
  bool _failed = false;
  String? _busyId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await api.get(Uri.parse('$_base/api/certificates'));
      if (res.statusCode != 200) throw Exception('HTTP ${res.statusCode}');
      final data = jsonDecode(utf8.decode(res.bodyBytes));
      final raw = data is Map ? data['certificates'] : null;
      final items = (raw is List ? raw : const [])
          .whereType<Map>()
          .map((m) => Map<String, dynamic>.from(m))
          .toList();
      if (mounted) setState(() => _items = items);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  void _retry() {
    setState(() {
      _failed = false;
      _items = null;
    });
    _load();
  }

  /// "19 August 2026", read in UTC like the printed certificate.
  String _issued(dynamic iso) {
    final d = DateTime.tryParse('${iso ?? ''}')?.toUtc();
    if (d == null) return '';
    return '${d.day} ${_months[d.month - 1]} ${d.year}';
  }

  String _fileName(String? disposition, String title) {
    final match = RegExp(r'filename="([^"]+)"').firstMatch(disposition ?? '');
    final name = (match?.group(1) ?? title).replaceAll(RegExp(r'[^A-Za-z0-9 .\-]'), '').trim();
    final safe = name.isEmpty ? 'Certificate' : name;
    return safe.toLowerCase().endsWith('.pdf') ? safe : '$safe.pdf';
  }

  Future<void> _download(Map<String, dynamic> item, BuildContext buttonContext) async {
    final id = '${item['kind']}:${item['key']}';
    final messenger = ScaffoldMessenger.of(context);
    // iPad share sheets need an anchor.
    final box = buttonContext.findRenderObject() as RenderBox?;
    final origin = box == null ? null : box.localToGlobal(Offset.zero) & box.size;
    setState(() => _busyId = id);
    try {
      final res = await api.get(Uri.parse('$_base${item['downloadPath']}'));
      if (res.statusCode != 200 || res.bodyBytes.isEmpty) {
        throw Exception('HTTP ${res.statusCode}');
      }
      final dir = await getTemporaryDirectory();
      final name = _fileName(res.headers['content-disposition'], '${item['title'] ?? 'Certificate'}');
      final file = File('${dir.path}/$name');
      await file.writeAsBytes(res.bodyBytes, flush: true);
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'application/pdf')],
        sharePositionOrigin: origin,
      );
    } catch (_) {
      messenger.showSnackBar(
        const SnackBar(content: Text('The download did not work. Try again in a minute.')),
      );
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = _items;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 16, 8, 8),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'My Certificates',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.textDark),
          ),
          const SizedBox(height: 2),
          Text(
            'Save or share a copy of any certificate you have earned.',
            style: TextStyle(fontSize: 12, color: AppColors.textLight),
          ),
          const SizedBox(height: 8),
          if (_failed)
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Your certificates could not be loaded.',
                    style: TextStyle(fontSize: 13, color: AppColors.textLight),
                  ),
                ),
                TextButton(
                  onPressed: _retry,
                  child: const Text('Try again', style: TextStyle(color: _primary, fontWeight: FontWeight.w600)),
                ),
              ],
            )
          else if (items == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Center(
                child: SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2, color: _primary),
                ),
              ),
            )
          else if (items.isEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                'Certificates you earn show up here.',
                style: TextStyle(fontSize: 13, color: AppColors.textLight),
              ),
            )
          else
            for (final item in items) _row(item),
        ],
      ),
    );
  }

  Widget _row(Map<String, dynamic> item) {
    final id = '${item['kind']}:${item['key']}';
    final number = '${item['number'] ?? ''}';
    final issued = _issued(item['issuedAt']);
    final details = [
      if (issued.isNotEmpty) 'Issued $issued',
      if (number.isNotEmpty) 'No. $number',
    ].join(' · ');
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: AppColors.border.withValues(alpha: 0.6))),
      ),
      child: Row(
        children: [
          const Icon(Icons.workspace_premium_outlined, color: _primary, size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${item['title'] ?? ''}',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textDark),
                ),
                if (details.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(details, style: TextStyle(fontSize: 11, color: AppColors.textLight)),
                ],
              ],
            ),
          ),
          Builder(
            builder: (buttonContext) => TextButton(
              onPressed: _busyId != null ? null : () => _download(item, buttonContext),
              child: _busyId == id
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: _primary),
                    )
                  : const Text('Download', style: TextStyle(color: _primary, fontWeight: FontWeight.w600)),
            ),
          ),
        ],
      ),
    );
  }
}
