import { Schema, model, models } from "mongoose";

const taskSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    assignedOn: { type: String, required: true },
    description: { type: String, required: true },
    deadline: { type: String, required: true },
    priority: { 
      type: String, 
      required: true, 
      enum: ["low", "medium", "high"] 
    },
    status: { 
      type: String, 
      required: true, 
      enum: ["not started", "in progress", "blocked", "on hold", "done"] 
    },
    notesByManager: { type: String, default: "" },
    documentLinkByManager: { type: String, default: "" },
    notesByUser: { type: String, default: "" },
    supportingLinksByUser: { type: String, default: "" },
    meetingLink: { type: String, default: "" },
    assignedTo: { type: String, required: true },
    customFields: { type: Schema.Types.Mixed, default: {} }, // Use Mixed type for custom fields
    editableFields: { type: [String], default: [] } // Fields that user can edit
  },
  { timestamps: true }
);

export const TaskModel = models.Task || model("Task", taskSchema);
