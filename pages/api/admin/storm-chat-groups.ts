// GET /api/admin/storm-chat-groups            (admin only) — list every group + subgroup
// GET /api/admin/storm-chat-groups?delete=ID&confirm=yes   — delete one group by id
//
// A rescue tool for groups the admin StormChat tree can't reach — e.g. a nested
// subgroup (a subgroup that ended up under another subgroup) is counted but
// never rendered, so it can't be deleted from the UI. This lists every non-DM
// group with its _id, parent, visibility and member count so duplicates are
// obvious, and can delete one by id (reparenting any children up to its parent
// first, so nothing is orphaned). GET is allowed so a signed-in admin can use it
// straight from the browser.
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import ChatGroup from "../../../src/lib/models/ChatGroup";
import { requireRole, allowMethods } from "../../../src/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  if (!requireRole(req, res, "admin")) return;

  await connectMongo();

  const all: any[] = await ChatGroup.find({})
    .select("_id name visibility parentGroupId members isDirect")
    .lean();

  // ── Delete mode ──────────────────────────────────────────────────────────
  const deleteId = typeof req.query.delete === "string" ? req.query.delete : "";
  if (deleteId) {
    if (req.query.confirm !== "yes") {
      return res.status(400).json({
        error: "Add &confirm=yes to actually delete.",
        wouldDelete: all.find((g) => String(g._id) === deleteId) || null,
      });
    }
    const target = all.find((g) => String(g._id) === deleteId);
    if (!target) return res.status(404).json({ error: "Group not found for that id" });

    // Reparent any children up to this group's parent so they stay visible.
    const reparent = await ChatGroup.updateMany(
      { parentGroupId: deleteId },
      { $set: { parentGroupId: target.parentGroupId || "" } }
    );
    await ChatGroup.findByIdAndDelete(deleteId);

    return res.status(200).json({
      ok: true,
      deleted: { id: deleteId, name: target.name },
      childrenReparented: (reparent as any).modifiedCount ?? 0,
    });
  }

  // ── List mode ────────────────────────────────────────────────────────────
  const nameById = new Map(all.map((g) => [String(g._id), g.name]));
  const groups = all
    .filter((g) => !g.isDirect)
    .map((g) => {
      const pid = String(g.parentGroupId || "");
      return {
        id: String(g._id),
        name: g.name,
        visibility: g.visibility || "(unset)",
        members: (g.members || []).length,
        isSubgroup: !!pid,
        parentId: pid || null,
        parentName: pid ? nameById.get(pid) || "(missing parent)" : null,
      };
    })
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  // Flag names that appear more than once (the likely duplicates to delete).
  const counts: Record<string, number> = {};
  for (const g of groups) counts[g.name] = (counts[g.name] || 0) + 1;
  const duplicates = groups.filter((g) => counts[g.name] > 1);

  return res.status(200).json({
    ok: true,
    totalGroups: groups.length,
    duplicateNames: [...new Set(duplicates.map((d) => d.name))],
    duplicates,
    groups,
    howToDelete:
      "Copy the id of the group you want to remove, then open: /api/admin/storm-chat-groups?delete=THAT_ID&confirm=yes",
  });
}
