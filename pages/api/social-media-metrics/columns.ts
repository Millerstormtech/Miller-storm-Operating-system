import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { CustomColumnModel } from "../../../src/lib/models/CustomColumn";
import { SocialMediaMetricsModel } from "../../../src/lib/models/SocialMediaMetrics";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await connectMongo();

  if (req.method === "GET") {
    try {
      console.log("=== FETCHING CUSTOM COLUMNS ===");
      const columns = await CustomColumnModel.find({}).sort({ createdAt: 1 });
      console.log("Found columns:", columns.length);
      columns.forEach(col => {
        console.log(`  - ${col.name} (${col.datatype})`);
      });
      res.status(200).json(columns);
    } catch (error) {
      console.error("Failed to fetch custom columns:", error);
      res.status(500).json({ error: "Failed to fetch columns" });
    }
  } else if (req.method === "POST") {
    try {
      const { name, datatype } = req.body;

      console.log("=== CREATING CUSTOM COLUMN ===");
      console.log("Name:", name);
      console.log("Datatype:", datatype);

      if (!name || !datatype) {
        console.log("✗ Missing name or datatype");
        res.status(400).json({ error: "Name and datatype are required" });
        return;
      }

      if (!["string", "number", "boolean", "date"].includes(datatype)) {
        console.log("✗ Invalid datatype");
        res.status(400).json({ error: "Invalid datatype" });
        return;
      }

      console.log("Creating column definition...");
      const column = await CustomColumnModel.create({
        id: `col-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
        name,
        datatype,
        createdAt: new Date()
      });

      console.log("✓ Column definition created:", column.id);

      // Set default values for all existing metrics based on datatype
      let defaultValue: any;
      switch (datatype) {
        case "number":
          defaultValue = 0;
          break;
        case "boolean":
          defaultValue = false;
          break;
        case "date":
          defaultValue = new Date();
          break;
        case "string":
        default:
          defaultValue = "";
          break;
      }

      console.log("Default value:", defaultValue);

      // Update all metrics with the new column and default value
      const updateData: any = {};
      updateData[name] = defaultValue;

      console.log("Updating all metrics with:", updateData);
      const updateResult = await SocialMediaMetricsModel.updateMany(
        {},
        { $set: updateData }
      );

      console.log(`✓ Updated ${updateResult.modifiedCount} metrics`);
      console.log(`Column "${name}" created and populated with default values (${datatype})`);

      res.status(201).json(column);
    } catch (error) {
      console.error("Failed to create custom column:", error);
      res.status(500).json({ error: "Failed to create column" });
    }
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).end();
  }
}
