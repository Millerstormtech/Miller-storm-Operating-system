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
