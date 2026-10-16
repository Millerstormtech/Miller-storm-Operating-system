import mongoose from "mongoose";
import { UserModel } from "../models/User";

// Who is asking, in every id form Storm Chat stores: group.members/admins and
// dmKey hold Mongo _ids, while the session (auth.sub) and createdBy hold the
// app id. Rule checks in ./access take this list.
export async function viewerIdsFor(appId: string): Promise<string[]> {
  const me = (await UserModel.findOne({ id: appId }, { _id: 1 }).lean()) as { _id?: unknown } | null;
  return [appId, me?._id ? String(me._id) : ""].filter(Boolean);
}

// Is the group's creator still an active account? createdBy is the creator's
// app id (older rows may hold a Mongo _id). Missing or deleted means "gone",
// which lets a company Admin delete the group (see canDeleteGroup).
export async function isCreatorActive(createdBy: unknown): Promise<boolean> {
  if (typeof createdBy !== "string" || !createdBy) return false;
  const or: any[] = [{ id: createdBy }];
  if (mongoose.isValidObjectId(createdBy)) or.push({ _id: createdBy });
  const u = (await UserModel.findOne({ $or: or }, { status: 1, deleted: 1 }).lean()) as any;
  if (!u) return false;
  return u.status !== "deleted" && u.deleted !== true;
}
