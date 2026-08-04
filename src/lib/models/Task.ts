import { Schema, model, models } from "mongoose";

const taskSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    assignedOn: { type: String, required: true },
    description: { type: String, required: true },
    // YYYY-MM-DD, written by <input type="date">. Deliberately a string: that
    // format sorts and compares correctly, and storing a Date would reintroduce
    // timezone drift on a field users think of as a plain calendar day.
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
    customFields: { type: Schema.Types.Mixed, default: {} },
    // Legacy: the old assign screen let a lead pick which fields a rep could
    // change. The builder is gone, but existing tasks still carry their list and
    // canEditField still honours it. New tasks leave this empty.
    editableFields: { type: [String], default: [] },

    // Who created or assigned this. Its absence is why the old API could not
    // enforce anything: a guard had nothing to compare against.
    createdBy: { type: String },
    // Work handed to you vs a note you wrote yourself.
    origin: { type: String, enum: ["assigned", "self"], default: "assigned" },
    // Only meaningful when origin is "self". Assigned tasks are always shared.
    visibility: { type: String, enum: ["private", "shared"], default: "private" },
    completedAt: { type: Date },
    deleted: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// The page's primary query is "my undeleted tasks, by due date". Without this
// the collection is scanned on every load.
taskSchema.index({ assignedTo: 1, deleted: 1, deadline: 1 });

export const TaskModel = models.Task || model("Task", taskSchema);
