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
  return members.length === 2 && g.name === "Direct Message";
}
