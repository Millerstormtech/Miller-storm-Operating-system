import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { requireUser, allowMethods } from "../../../src/lib/auth";

// Save the caller's OWN manual drag-order for their StormChat list.
//
//   POST { list: "dms" | "groups", order: string[] }  (ChatGroup _id strings)
//
// Self only — there is no body-supplied userId, unlike a few other endpoints
// in this app that let an admin act on another user's behalf: reordering is a
// personal display preference with nothing to override on someone else's
// account. Stored on the caller's own User.chatOrder.{dms,groups}, which
// pages/api/storm-chat/groups (GET ?mine=1) reads back and applies via
// applyCustomOrder() — that's the ONLY place ordering is decided, so a reorder
// saved here shows up identically on web and mobile the next time either one
// loads the list (web already polls every few seconds; mobile picks it up on
// its next fetch).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["POST"])) return;

  const auth = requireUser(req, res);
  if (!auth) return;

  const list = req.body?.list;
  const order = req.body?.order;
  if (list !== "dms" && list !== "groups") {
    return res.status(400).json({ error: "list must be 'dms' or 'groups'" });
  }
  if (!Array.isArray(order) || order.some((id) => typeof id !== "string")) {
    return res.status(400).json({ error: "order must be an array of chat ids" });
  }

  await connectMongo();

  // Dot-notation $set on a nested path creates chatOrder if it doesn't exist
  // yet, and leaves the OTHER list (dms vs groups) untouched — a rep who has
  // only ever reordered their DMs must not have an empty Groups order forced
  // on them by this write.
  await UserModel.updateOne({ id: auth.sub }, { $set: { [`chatOrder.${list}`]: order } });

  res.status(200).json({ success: true });
}
