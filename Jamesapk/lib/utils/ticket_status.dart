/// A support ticket moves open → in_progress → completed, the same as the web
/// (src/lib/support/ticketStatus.ts). "approved" and "rejected" were retired on
/// 2026-09-30: the server already maps old tickets, and this does the same for
/// anything it still sees — approved meant someone had picked it up, rejected
/// meant it was closed.
const ticketStatuses = ['open', 'in_progress', 'completed'];

const ticketStatusLabel = {
  'open': 'Open',
  'in_progress': 'In Progress',
  'completed': 'Completed',
};

String normalizeTicketStatus(Object? status) {
  final s = status?.toString() ?? '';
  if (ticketStatuses.contains(s)) return s;
  if (s == 'approved') return 'in_progress';
  if (s == 'rejected') return 'completed';
  return 'open';
}
