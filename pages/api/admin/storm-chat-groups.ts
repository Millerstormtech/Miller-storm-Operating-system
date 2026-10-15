// GET    /api/admin/storm-chat-groups               (admin only) — list every group + subgroup
// DELETE /api/admin/storm-chat-groups  { id, confirm: "yes" } — delete one group by id
//
// A rescue tool for groups the admin StormChat tree can't reach — e.g. a nested
// subgroup (a subgroup that ended up under another subgroup) is counted but
// never rendered, so it can't be deleted from the UI. This lists every non-DM
// group with its _id, parent, visibility and member count so duplicates are
// obvious, and can delete one by id (reparenting any children up to its parent
// first, so nothing is orphaned). Deleting needs a deliberate DELETE request
// (it used to be a plain GET link, so merely opening a URL deleted a group,
// DMs included); a DM can never be deleted here.
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import ChatGroup from "../../../src/lib/models/ChatGroup";
import ChatMessage from "../../../src/lib/models/ChatMessage";
import GroupJoinRequest from "../../../src/lib/models/GroupJoinRequest";
import GroupReadReceipt from "../../../src/lib/models/GroupReadReceipt";
import { NotificationModel } from "../../../src/lib/models/Notification";
import { isDmGroup } from "../../../src/lib/stormchat/isDm";
import { requireRole, allowMethods } from "../../../src/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET", "DELETE"])) return;
  if (!requireRole(req, res, "admin")) return;

  await connectMongo();

  const all: any[] = await ChatGroup.find({})
    .select("_id name visibility parentGroupId members isDirect dmKey")
    .lean();

  // ── Delete mode ──────────────────────────────────────────────────────────
  if (req.method === "DELETE") {
    const deleteId = typeof req.body?.id === "string" ? req.body.id : "";
    if (req.body?.confirm !== "yes") {
      return res.status(400).json({
        error: "Add &confirm=yes to actually delete.",
        wouldDelete: all.find((g) => String(g._id) === deleteId) || null,
      });
    }
    const target = all.find((g) => String(g._id) === deleteId);
    if (!target) return res.status(404).json({ error: "Group not found for that id" });
    if (isDmGroup(target)) return res.status(400).json({ error: "A direct message can't be deleted here" });

    // Reparent any children up to this group's parent so they stay visible.
    const reparent = await ChatGroup.updateMany(
      { parentGroupId: deleteId },
      { $set: { parentGroupId: target.parentGroupId || "" } }
    );
    await ChatGroup.findByIdAndDelete(deleteId);
    // Nothing of the deleted group is left behind.
    await Promise.all([
      ChatMessage.deleteMany({ groupId: deleteId }),
      GroupJoinRequest.deleteMany({ groupId: deleteId }),
      GroupReadReceipt.deleteMany({ groupId: deleteId }),
      NotificationModel.deleteMany({ "metadata.groupId": deleteId }),
    ]);

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
      'Send DELETE /api/admin/storm-chat-groups with body { "id": "THAT_ID", "confirm": "yes" }. DMs cannot be deleted here.',
  });
}
