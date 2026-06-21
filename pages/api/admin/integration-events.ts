import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { IntegrationEventModel } from "../../../src/lib/models/IntegrationEvent";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }

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
