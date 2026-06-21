import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { SocialMediaMetricsModel } from "../../../src/lib/models/SocialMediaMetrics";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await connectMongo();

  if (req.method === "GET") {
    try {
      console.log("=== FETCHING METRICS ===");
      const metrics = await SocialMediaMetricsModel.find({}).sort({ displayOrder: 1, platform: 1 });
      
      console.log("Fetched metrics count:", metrics.length);
      if (metrics.length > 0) {
        const firstObj = metrics[0].toObject();
        console.log("First metric all keys:", Object.keys(firstObj));
        console.log("First metric full data:", JSON.stringify(firstObj, null, 2));
      }

      // Convert to plain objects to ensure all fields are included
      const plainMetrics = metrics.map(m => {
        const obj = m.toObject();
        console.log(`Metric ${obj.id} keys:`, Object.keys(obj));
        return obj;
      });
      
      console.log("=== RETURNING METRICS ===");
      res.status(200).json(plainMetrics);
    } catch (error) {
      console.error("Failed to fetch social media metrics:", error);
      res.status(500).json({ error: "Failed to fetch metrics" });
    }
  } else if (req.method === "POST") {
    try {
      const { platform, platformName, followers, posts30d, views30d } = req.body;

      if (!platform || !platformName) {
        res.status(400).json({ error: "Platform and platform name are required" });
        return;
      }

      const metric = await SocialMediaMetricsModel.create({
        id: `social-${platform}-${Date.now()}`,
        platform,
        platformName,
        followers: followers || 0,
        posts30d: posts30d || 0,
        views30d: views30d || 0,
        lastUpdated: new Date()
      });

      res.status(201).json(metric);
    } catch (error) {
      console.error("Failed to create social media metric:", error);
      res.status(500).json({ error: "Failed to create metric" });
    }
  } else if (req.method === "PUT") {
    try {
      const metrics = req.body;

      if (!Array.isArray(metrics)) {
        res.status(400).json({ error: "Expected array of metrics" });
        return;
      }

      console.log("=== SAVING METRICS ===");
      console.log("Received metrics count:", metrics.length);
      console.log("First metric sample:", JSON.stringify(metrics[0], null, 2));

      // Update all metrics with their new order
      const results = [];
      for (let index = 0; index < metrics.length; index++) {
        const metric = metrics[index];
        try {
          // Generate new ID for new metrics
          let metricId = metric.id;
          if (metric.id.startsWith("social-new-")) {
            metricId = `social-${metric.platformName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
          }

          // Create update data - copy all fields from metric
          const updateData: any = { ...metric };
          updateData.id = metricId;
          updateData.lastUpdated = new Date();
          updateData.displayOrder = index; // Set order based on position in array

          // Ensure platform is set
          if (!updateData.platform) {
            updateData.platform = metric.platformName.toLowerCase();
          }

          console.log(`Saving metric: ${metricId} at order ${index}`);
          console.log("Update data keys before cleanup:", Object.keys(updateData));

          // Remove immutable fields that shouldn't be updated
          delete updateData._id;
          delete updateData.__v;
          delete updateData.createdAt;
          delete updateData.updatedAt;

          console.log("Update data keys after cleanup:", Object.keys(updateData));
          console.log("Update data:", JSON.stringify(updateData, null, 2));

          // Use direct MongoDB collection update to bypass Mongoose schema restrictions
          const db = require("mongoose").connection.db;
          const collection = db.collection("socialmediametrics");
          
          await collection.updateOne(
            { id: metricId },
            { $set: updateData },
            { upsert: true }
          );

          // Fetch the saved document to verify
          const result = await SocialMediaMetricsModel.findOne({ id: metricId });
          console.log(`Saved successfully: ${metricId}`);
          console.log("Saved data keys:", Object.keys(result.toObject()));
          console.log("Saved data:", JSON.stringify(result.toObject(), null, 2));
          results.push(result);
        } catch (itemError) {
          console.error(`Error saving metric ${metric.id}:`, itemError);
          throw itemError;
        }
      }

      console.log("=== SAVE COMPLETE ===");
      res.status(200).json({ 
        message: "Metrics updated successfully", 
        count: metrics.length,
        success: true
      });
    } catch (error) {
      console.error("Failed to update metrics:", error);
      res.status(500).json({ 
        error: "Failed to update metrics", 
        details: error instanceof Error ? error.message : 'Unknown error',
        success: false
      });
    }
  } else {
    res.setHeader("Allow", ["GET", "POST", "PUT"]);
    res.status(405).end();
  }
}
