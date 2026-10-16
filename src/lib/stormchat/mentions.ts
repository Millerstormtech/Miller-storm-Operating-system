// Who a Storm Chat message mentions and who gets alerted (readiness test
// item 13, GroupMe-style). Pure so the rules are unit-tested.
//
// - "@Name" counts when followed by the end of the text, a space OR
//   punctuation ("@Sam Taylor," used to be highlighted but never alerted).
// - "@all" mentions every member, but only when a group admin (or company
//   Admin) sends it; from anyone else it's just text.
// - A person who muted the group gets no alert for ordinary messages, but a
//   mention (including @all) still reaches them, as in GroupMe.

type Person = { _id: unknown; name?: string | null };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Not followed by another letter, digit or underscore (so "@Sam Taylorson"
// doesn't mention "Sam Taylor").
const END = '(?=$|[^\\p{L}\\p{N}_])';

export function mentionedIds(text: string, people: Person[]): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const p of people) {
    const name = (p.name || '').trim();
    if (!name) continue;
    if (new RegExp(`@${escape(name)}${END}`, 'iu').test(text)) out.push(String(p._id));
  }
  return out;
}

export function mentionsAll(text: string): boolean {
  return !!text && new RegExp(`(^|[^\\p{L}\\p{N}_])@all${END}`, 'iu').test(text);
}

/**
 * Split recipients into mention alerts and ordinary "new message" alerts.
 * All ids are the Mongo _ids groups store; `senderIds` may also hold the app id.
 */
export function alertPlan(opts: {
  members: string[];
  senderIds: string[];
  mentioned: string[];
  atAll: boolean;          // the text contains @all
  senderIsAdmin: boolean;  // group admin or company Admin in this group
  mutedBy: string[];
}): { mention: string[]; ordinary: string[] } {
  const sender = new Set(opts.senderIds.map(String));
  const members = opts.members.map(String).filter((m) => !sender.has(m));
  const muted = new Set(opts.mutedBy.map(String));
  const mention = opts.atAll && opts.senderIsAdmin
    ? members
    : Array.from(new Set(opts.mentioned.map(String))).filter((m) => !sender.has(m) && members.includes(m));
  const mentionSet = new Set(mention);
  const ordinary = members.filter((m) => !mentionSet.has(m) && !muted.has(m));
  return { mention, ordinary };
}
