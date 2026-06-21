import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { SocialMediaMetricsModel } from "../../../src/lib/models/SocialMediaMetrics";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await connectMongo();

  const { id } = req.query;

  if (req.method === "PUT") {
    try {
      const { platform, platformName, followers, posts30d, views30d } = req.body;

      const metric = await SocialMediaMetricsModel.findOneAndUpdate(
        { id },
        {
          platform,
          platformName,
          followers: followers || 0,
          posts30d: posts30d || 0,
          views30d: views30d || 0,
          lastUpdated: new Date()
        },
        { new: true }
      );

      if (!metric) {
        res.status(404).json({ error: "Metric not found" });
        return;
      }

      res.status(200).json(metric);
    } catch (error) {
      console.error("Failed to update metric:", error);
      res.status(500).json({ error: "Failed to update metric" });
    }
  } else if (req.method === "DELETE") {
    try {
      const metric = await SocialMediaMetricsModel.findOneAndDelete({ id });

      if (!metric) {
        res.status(404).json({ error: "Metric not found" });
        return;
      }

      res.status(200).json({ message: "Metric deleted successfully" });
    } catch (error) {
      console.error("Failed to delete metric:", error);
      res.status(500).json({ error: "Failed to delete metric" });
    }
  } else {
    res.setHeader("Allow", ["PUT", "DELETE"]);
    res.status(405).end();
  }
}
