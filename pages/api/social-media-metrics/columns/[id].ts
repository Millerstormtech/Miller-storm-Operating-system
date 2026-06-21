import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../../src/lib/mongodb";
import { CustomColumnModel } from "../../../../src/lib/models/CustomColumn";
import { SocialMediaMetricsModel } from "../../../../src/lib/models/SocialMediaMetrics";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await connectMongo();

  const { id } = req.query;

  if (req.method === "DELETE") {
    try {
      // Find the column to get its name
      const column = await CustomColumnModel.findOne({ id });

      if (!column) {
        res.status(404).json({ error: "Column not found" });
        return;
      }

      // Delete the column definition
      await CustomColumnModel.findOneAndDelete({ id });

      // Remove the column data from all metrics
      const updateQuery: any = {};
      updateQuery[column.name] = 1; // Mark field for deletion
      
      await SocialMediaMetricsModel.updateMany(
        {},
        { $unset: { [column.name]: 1 } }
      );

      res.status(200).json({ message: "Column deleted successfully" });
    } catch (error) {
      console.error("Failed to delete custom column:", error);
      res.status(500).json({ error: "Failed to delete column" });
    }
  } else {
    res.setHeader("Allow", ["DELETE"]);
    res.status(405).end();
  }
}
