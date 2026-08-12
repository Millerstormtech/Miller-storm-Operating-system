// Whether a chat group is a private 1-on-1 direct message (DM).
//
// A DM must NEVER be visible to anyone but its two members — not in anyone
// else's group list, and not readable by an admin. Historically this relied on
// a single `isDirect` flag, but DM documents created before that flag existed
// (or before `dmKey`) slipped through and were treated as normal groups — which
// leaked private threads to everyone. Detect a DM by ANY reliable signal:
//   - the explicit isDirect flag, or
//   - a dmKey (only DMs have one), or
//   - a legacy 2-member "Direct Message" placeholder (the name dm.ts assigns).
export function isDmGroup(g: any): boolean {
  if (!g) return false;
  if (g.isDirect === true) return true;
  if (g.dmKey) return true;
  const members = Array.isArray(g.members) ? g.members : [];
  if (members.length === 2 && g.name === "Direct Message") return true;
  // Permanent privacy backstop: every REAL group is created with an explicit
  // public/private `visibility` (the group-creation POST always sets it), while
  // a DM never has one. So a 2-member thread with no `visibility` can only be a
  // direct message — including legacy DM docs that predate the isDirect/dmKey
  // flags AND were named something other than "Direct Message". Treating them
  // as DMs keeps them strictly members-only everywhere isDmGroup is checked
  // (the groups list, message read-access), so a private thread can never leak
  // into a stranger's chat list again.
  if (members.length === 2 && !g.visibility) return true;
  return false;
}
