import { Schema, model, models } from "mongoose";

const customColumnSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    datatype: { 
      type: String, 
      enum: ["string", "number", "boolean", "date"],
      required: true 
    },
    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

export const CustomColumnModel = models.CustomColumn || model("CustomColumn", customColumnSchema);
