// Storm Chat rules the phone needs, mirroring the server (PR #102) so the two
// never disagree. Pure: no widgets, no network.
//
// - What the viewer may do in a chat comes from the server's `myRights`
//   (GET /api/storm-chat/groups/:id, src/lib/stormchat/access.ts chatRights).
//   chatRightsFallback is the same rule, used only until that answer arrives
//   or when an older server doesn't send it.
// - Messages load in pages (src/lib/stormchat/messagePages.ts): the newest
//   page refreshes every few seconds and older pages are added on top.

/// Longest message the server accepts (src/lib/stormchat/compose.ts).
const kMaxMessageChars = 2000;
const kTooLongMessage = 'Messages can be up to 2,000 characters';

/// The rights a screen reads. Same keys as the server's ChatRights.
const kChatRightKeys = [
  'isMember', 'isGroupAdmin', 'canRead', 'canSend', 'canPin',
  'canModerate', 'canManage', 'canDelete', 'canLeave',
];

bool _listed(dynamic list, Set<String> myIds) =>
    list is List && list.any((m) => myIds.contains(m?.toString()));

/// The server's chatRights, from what the chat list already sent. A company
/// Admin is a group admin of every group (never of a DM); an admin-only group
/// lets only its group admins post; anyone who can post can pin.
Map<String, bool> chatRightsFallback(Map group, Set<String> myIds, String role) {
  final dm = group['isDirect'] == true;
  final companyAdmin = role.toLowerCase() == 'admin';
  final listed = _listed(group['members'], myIds) || _listed(group['admins'], myIds);
  final groupAdmin = !dm && (companyAdmin || _listed(group['admins'], myIds));
  final canRead = listed || (!dm && companyAdmin);
  final adminOnly = !dm && group['onlyAdminCanChat'] == true;
  final canSend = canRead && (!adminOnly || groupAdmin);
  final createdBy = group['createdBy']?.toString();
  return {
    'isMember': listed,
    'isGroupAdmin': groupAdmin,
    'canRead': canRead,
    'canSend': canSend,
    'canPin': canSend,
    'canModerate': groupAdmin,
    'canManage': groupAdmin,
    'canDelete': !dm && createdBy != null && myIds.contains(createdBy),
    'canLeave': !dm && listed,
  };
}

/// Did I vote for this poll option? Votes are stored under the app id, while
/// the app often holds the Mongo _id, so check every id form I have.
bool votedByMe(dynamic votes, Set<String> myIds) => _listed(votes, myIds);

// ---- paging (src/lib/stormchat/messagePages.ts) ---------------------------

DateTime _at(Map m) => DateTime.tryParse('${m['createdAt']}') ?? DateTime.fromMillisecondsSinceEpoch(0);

/// Chat order: oldest first; equal times broken by id.
int compareMessages(Map a, Map b) {
  final t = _at(a).compareTo(_at(b));
  return t != 0 ? t : '${a['_id']}'.compareTo('${b['_id']}');
}

/// Merge a refreshed newest page into what's on screen. A page shorter than
/// a full page IS the whole chat. Otherwise keep the older messages the person
/// scrolled up to, then the fresh page (anything inside the page's range that
/// is missing from it was deleted, so it drops out).
List<Map<String, dynamic>> mergeNewestPage(
    List<Map<String, dynamic>> current, List<Map<String, dynamic>> newest, int pageSize) {
  if (newest.length < pageSize) return newest;
  final first = newest.first;
  final older = current.where((m) => compareMessages(m, first) < 0);
  return [...older, ...newest];
}

/// Put an older page in front of what's on screen, without duplicates.
List<Map<String, dynamic>> prependOlderPage(
    List<Map<String, dynamic>> current, List<Map<String, dynamic>> older) {
  final have = current.map((m) => '${m['_id']}').toSet();
  return [...older.where((m) => !have.contains('${m['_id']}')), ...current]..sort(compareMessages);
}

// ---- GroupMe parity, batch 1 and 2 (PRs #105, #106) -----------------------
// Mirrors src/lib/stormchat/messageChanges.ts, mute.ts, richMessages.ts.

const kEditWindow = Duration(minutes: 15);
const kDeletedText = 'This message was deleted';
const kVoiceMaxSec = 5 * 60;
const kAlbumMax = 10;

/// Deleted messages stay in the chat as "This message was deleted".
bool isDeletedMessage(Map m) => m['deletedAt'] != null;

bool _isGiphy(Map m) => RegExp(r'(^|\.)giphy\.com/', caseSensitive: false)
    .hasMatch((m['mediaUrl'] ?? '').toString().replaceFirst(RegExp(r'^https?://', caseSensitive: false), ''));

/// May I edit this message now? My own text or photo/video caption, for 15
/// minutes after sending; not GIFs, voice notes or locations (their text is
/// generated), never a deleted message. Same rule as the server's.
bool canEditMessage(Map m, Set<String> myIds, {DateTime? now}) {
  if (!myIds.contains('${m['senderId']}') || isDeletedMessage(m)) return false;
  final type = '${m['messageType'] ?? 'text'}';
  if (type != 'text' && type != 'image' && type != 'video') return false;
  if (type == 'image' && _isGiphy(m)) return false;
  if (m['voice'] != null || m['location'] != null) return false;
  final sent = DateTime.tryParse('${m['createdAt']}');
  if (sent == null) return false;
  return (now ?? DateTime.now()).difference(sent) <= kEditWindow;
}

/// "1:05" for 65 seconds.
String formatDuration(num seconds) {
  final s = seconds.round().clamp(0, 1 << 31);
  return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
}

/// Has this poll's end time passed?
bool pollEnded(Map? poll, {DateTime? now}) {
  final end = DateTime.tryParse('${poll?['endsAt'] ?? ''}');
  return end != null && !end.isAfter(now ?? DateTime.now());
}

// Central time, like the rest of the chat (CDT from the second Sunday of
// March, CST from the first Sunday of November).
DateTime centralTime(DateTime t) {
  final utc = t.toUtc();
  final y = utc.year;
  final marchSunday = 1 + ((7 - DateTime.utc(y, 3, 1).weekday) % 7);
  final novSunday = 1 + ((7 - DateTime.utc(y, 11, 1).weekday) % 7);
  final dst = !utc.isBefore(DateTime.utc(y, 3, marchSunday + 7, 8)) && utc.isBefore(DateTime.utc(y, 11, novSunday, 7));
  return utc.subtract(Duration(hours: dst ? 5 : 6));
}

const _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

String _clock(DateTime c) {
  final h = c.hour % 12 == 0 ? 12 : c.hour % 12;
  return '$h:${c.minute.toString().padLeft(2, '0')} ${c.hour < 12 ? 'AM' : 'PM'}';
}

/// "4:30 PM" today, "Sat 10:00 AM" another day (Central): the end of a mute
/// or of a poll.
String centralWhenLabel(String iso, {DateTime? now}) {
  final t = DateTime.tryParse(iso);
  if (t == null) return '';
  final c = centralTime(t);
  final today = centralTime(now ?? DateTime.now());
  final sameDay = c.year == today.year && c.month == today.month && c.day == today.day;
  return sameDay ? _clock(c) : '${_weekdays[c.weekday - 1]} ${_clock(c)}';
}

/// How long to mute, as the server takes it, with what the menu says.
const kMuteChoices = [
  ['1h', 'For 1 hour'],
  ['8h', 'For 8 hours'],
  ['1d', 'For 1 day'],
  ['forever', 'Until I turn it back on'],
];

/// Photos and videos sent together share an albumId and show as one grid.
/// Returns the album's live (not deleted) items when [m] is in one with at
/// least 2, else null.
List<Map<String, dynamic>>? albumOf(Map m, List messages) {
  final id = m['albumId'];
  if (id == null || '$id'.isEmpty || isDeletedMessage(m)) return null;
  final items = messages
      .whereType<Map>()
      .where((x) => x['albumId'] == id && !isDeletedMessage(x))
      .map((x) => Map<String, dynamic>.from(x))
      .toList();
  return items.length > 1 ? items : null;
}

/// A photo/video message's file name is not a caption (the server ignores it).
String captionOf(Map m) {
  final text = '${m['message'] ?? ''}'.trim();
  final type = '${m['messageType'] ?? ''}';
  final fileName = RegExp(r'^[^\s/\\]+\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?|mp4|mov|m4v|webm|3gp|avi|mkv)$', caseSensitive: false);
  if ((type == 'image' || type == 'video') && fileName.hasMatch(text)) return '';
  return text;
}
