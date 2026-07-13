/// Maps a role KEY to its user-facing display label. Only affects displayed
/// text; role keys used in logic are unchanged elsewhere.
String roleDisplayName(String? role) {
  if (role == null || role.isEmpty) return '';
  switch (role.toLowerCase()) {
    case 'manager':
      return 'Sales Team Lead';
    case 'branch-manager':
      return 'Branch Manager';
    case 'c-level':
      return 'C-Level';
    default:
      return role[0].toUpperCase() + role.substring(1);
  }
}
