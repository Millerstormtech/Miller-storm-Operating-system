import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { IntegrationEventModel } from "../../../src/lib/models/IntegrationEvent";
import { requireRole, allowMethods } from "../../../src/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  if (!requireRole(req, res, "admin")) return;

  await connectMongo();

  const events = await IntegrationEventModel.find(
    {},
    "externalEventId source eventType milestoneName repName repExternalId revenue eventDate status failureReason location companyName createdAt"
  )
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  return res.status(200).json(events);
}
