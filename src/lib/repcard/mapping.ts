// src/lib/repcard/mapping.ts
// Pure, import-free RepCard response mappers (testable with `node --test`).

export interface RepCardUser { repcardUserId: string; email: string; name: string; phone: string; }
export interface KnockDraft { repcardUserId: string; name: string; verifiedKnocks: number; }

// Flat array of /api/users result.data items -> id -> user.
export function buildUserIndex(items: any[]): Map<string, RepCardUser> {
  const map = new Map<string, RepCardUser>();
  for (const u of items || []) {
    const id = String(u.id);
    const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || (u.email ?? "") || id;
    map.set(id, { repcardUserId: id, email: u.email ?? "", name, phone: u.phoneNumber ?? "" });
  }
  return map;
}

// /api/leaderboards `result` array -> one draft per rep on the target leaderboard with vdk > 0.
export function extractKnockDrafts(
  result: any[],
  opts: { leaderboardId: string; leaderboardName: string; vdkField: string }
): KnockDraft[] {
  const lbs = Array.isArray(result) ? result : [];
  const lb = lbs.find((x) => x?._id === opts.leaderboardId) || lbs.find((x) => x?.leaderboard_name === opts.leaderboardName);
  const rows = lb?.stats?.stats ?? [];
  const out: KnockDraft[] = [];
  for (const r of rows) {
    const vdk = Number(r?.[opts.vdkField] ?? 0);
    if (vdk > 0) out.push({ repcardUserId: String(r.item_id), name: r.item_title ?? "", verifiedKnocks: vdk });
  }
  return out;
}
