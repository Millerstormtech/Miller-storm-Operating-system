import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { TaskModel } from "../../../src/lib/models/Task";
import { UserModel } from "../../../src/lib/models/User";
import { NotificationModel } from "../../../src/lib/models/Notification";
import { requireUser, allowMethods } from "../../../src/lib/auth";
import {
  scopeFor,
  canAssignTo,
  canViewTask,
  canEditField,
  type Actor,
  type TargetUser
} from "../../../src/lib/tasks/permissions";

// Load the caller as an Actor. Role and id come from the signed token; only the
// branch list is read from the database.
async function loadActor(userId: string, role: string): Promise<Actor | null> {
  const me = (await UserModel.findOne({ id: userId }).select("id role branches").lean()) as any;
  if (!me) return null;
  return { id: userId, role, branches: me.branches ?? [] };
}

// id -> { id, managerId, branches } for every user named in a set of tasks, so
// canViewTask can be applied without one query per task.
async function loadOwners(ids: string[]): Promise<Record<string, TargetUser>> {
  const unique = Array.from(new Set(ids));
  const users = (await UserModel.find({ id: { $in: unique } })
    .select("id managerId branches")
    .lean()) as any[];
  const map: Record<string, TargetUser> = {};
  for (const u of users) {
    map[u.id] = { id: u.id, managerId: u.managerId, branches: u.branches ?? [] };
  }
  return map;
}

function truncate(text: string, max = 120): string {
  const clean = String(text ?? "").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean;
}

async function handleGet(req: NextApiRequest, res: NextApiResponse, actor: Actor) {
  const view = req.query.view === "team" ? "team" : "mine";
  const scope = scopeFor(actor);

  if (view === "team" && scope.mode === "self") {
    return res.status(403).json({ error: "Not permitted to view other people's tasks" });
  }

  const base: any = { deleted: { $ne: true } };

  // "mine" always means exactly my own tasks, whatever my role is.
  if (view === "mine") {
    const tasks = await TaskModel.find({ ...base, assignedTo: actor.id })
      .sort({ deadline: 1 })
      .lean();
    return res.status(200).json(tasks);
  }

  // "team": narrow in the database first, then apply the privacy rule.
  const filter: any = { ...base };
  if (scope.mode === "team") {
    const reports = (await UserModel.find({ managerId: actor.id }).select("id").lean()) as any[];
    filter.assignedTo = { $in: reports.map((u) => u.id) };
  } else if (scope.mode === "branch") {
    const inBranch = (await UserModel.find({ branches: { $in: scope.branches } })
      .select("id")
      .lean()) as any[];
    filter.assignedTo = { $in: inBranch.map((u) => u.id) };
  }
  // scope.mode === "all" needs no assignedTo narrowing.

  const candidates = (await TaskModel.find(filter).sort({ deadline: 1 }).lean()) as any[];
  const owners = await loadOwners(candidates.map((t) => t.assignedTo));
  const visible = candidates.filter((t) =>
    canViewTask(actor, t, owners[t.assignedTo] ?? { id: t.assignedTo })
  );

  return res.status(200).json(visible);
}

async function handlePost(req: NextApiRequest, res: NextApiResponse, actor: Actor) {
  const { assignedTo, description, deadline, priority, visibility } = req.body ?? {};

  if (!description || !String(description).trim()) {
    return res.status(400).json({ error: "description is required" });
  }
  if (!deadline) return res.status(400).json({ error: "deadline is required" });
  if (!["low", "medium", "high"].includes(priority)) {
    return res.status(400).json({ error: "priority must be low, medium or high" });
  }

  const targets: string[] = Array.isArray(assignedTo)
    ? assignedTo.filter(Boolean)
    : [assignedTo || actor.id];
  if (targets.length === 0) return res.status(400).json({ error: "assignedTo is required" });

  const owners = await loadOwners(targets);
  for (const targetId of targets) {
    const target = owners[targetId];
    if (!target) return res.status(400).json({ error: `Unknown user: ${targetId}` });
    if (!canAssignTo(actor, target)) {
      return res.status(403).json({ error: "Not permitted to assign to that person" });
    }
  }

  const assignedOn = new Date().toISOString().slice(0, 10);
  const created: any[] = [];

  for (const targetId of targets) {
    const isSelf = String(targetId) === String(actor.id);
    const task = await TaskModel.create({
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      assignedOn,
      description: String(description).trim(),
      deadline,
      priority,
      status: "not started",
      assignedTo: targetId,
      // createdBy comes from the signed token. A createdBy in the body is ignored.
      createdBy: actor.id,
      origin: isSelf ? "self" : "assigned",
      visibility: isSelf ? (visibility === "shared" ? "shared" : "private") : "shared",
      notesByManager: req.body?.notesByManager ?? "",
      documentLinkByManager: req.body?.documentLinkByManager ?? "",
      meetingLink: req.body?.meetingLink ?? "",
      editableFields: []
    });
    created.push(task);

    // Tell the person they were given work. Self-created tasks notify nobody.
    if (!isSelf) {
      await NotificationModel.create({
        id: `task-assigned-${task.id}`,
        userId: targetId,
        type: "task_assigned",
        title: "New task assigned",
        message: truncate(description),
        read: false,
        metadata: { taskId: task.id, deadline, priority, assignedBy: actor.id }
      });
    }
  }

  return res.status(201).json(created.length === 1 ? created[0] : created);
}

async function handlePut(req: NextApiRequest, res: NextApiResponse, actor: Actor) {
  const { id, ...changes } = req.body ?? {};
  if (!id) return res.status(400).json({ error: "id is required" });

  const task = (await TaskModel.findOne({ id, deleted: { $ne: true } }).lean()) as any;
  if (!task) return res.status(404).json({ error: "Task not found" });

  const owners = await loadOwners([task.assignedTo]);
  const owner = owners[task.assignedTo] ?? { id: task.assignedTo };

  // Every field in the body must be permitted. One bad field rejects the whole
  // request, so a partial write can never happen.
  for (const field of Object.keys(changes)) {
    if (!canEditField(actor, task, field, owner)) {
      return res.status(403).json({ error: `Not permitted to change ${field}` });
    }
  }

  const update: any = { ...changes };
  if (changes.status === "done" && task.status !== "done") {
    update.completedAt = new Date();
  }
  if (changes.status && changes.status !== "done" && task.status === "done") {
    update.completedAt = null;
  }

  const saved = await TaskModel.findOneAndUpdate({ id }, update, { new: true }).lean();
  return res.status(200).json(saved);
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse, actor: Actor) {
  const { id } = req.body ?? {};
  if (!id) return res.status(400).json({ error: "id is required" });

  const task = (await TaskModel.findOne({ id, deleted: { $ne: true } }).lean()) as any;
  if (!task) return res.status(404).json({ error: "Task not found" });

  const owners = await loadOwners([task.assignedTo]);
  const owner = owners[task.assignedTo] ?? { id: task.assignedTo };

  const isCreator = task.createdBy && String(task.createdBy) === String(actor.id);
  const isOrgWide = actor.role === "admin" || actor.role === "c-level";
  // Legacy tasks predate createdBy, so fall back to "could you have assigned it".
  const legacyFallback = !task.createdBy && canAssignTo(actor, owner);

  if (!isCreator && !isOrgWide && !legacyFallback) {
    return res.status(403).json({ error: "Not permitted to delete this task" });
  }

  await TaskModel.updateOne({ id }, { deleted: true });
  return res.status(204).end();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET", "POST", "PUT", "DELETE"])) return;

  const auth = requireUser(req, res);
  if (!auth) return;

  await connectMongo();

  const actor = await loadActor(auth.sub, auth.role);
  if (!actor) return res.status(404).json({ error: "User not found" });

  if (req.method === "GET") return handleGet(req, res, actor);
  if (req.method === "POST") return handlePost(req, res, actor);
  if (req.method === "PUT") return handlePut(req, res, actor);
  if (req.method === "DELETE") return handleDelete(req, res, actor);
}
