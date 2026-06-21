import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../src/lib/mongodb";
import { NotificationModel } from "../../src/lib/models/Notification";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await connectMongo();

  if (req.method === "GET") {
    const { userId } = req.query;
    const notifications = await NotificationModel.find({ userId }).sort({ createdAt: -1 }).lean();
    res.status(200).json(notifications);
    return;
  }

  if (req.method === "POST") {
    const notification = await NotificationModel.create({
      id: `notif-${Date.now()}`,
      ...req.body
    });
    res.status(201).json(notification);
    return;
  }

  if (req.method === "PUT") {
    const { id } = req.body;
    await NotificationModel.updateOne({ id }, { read: true });
    res.status(200).json({ success: true });
    return;
  }

  if (req.method === "DELETE") {
    const { id } = req.body;
    await NotificationModel.deleteOne({ id });
    res.status(200).json({ success: true });
    return;
  }

  res.setHeader("Allow", "GET, POST, PUT, DELETE");
  res.status(405).end();
}
