import { Schema, model, models } from "mongoose";

const userRequestSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, required: true },
    // Sales reps pick their Branch + Team (Sales Team Lead) at registration, so
    // the approved account lands with them already set. Empty for other roles.
    branch: { type: String, default: "" },
    managerId: { type: String, default: "" },
    status: { 
      type: String, 
      enum: ["pending", "approved", "rejected"], 
      default: "pending" 
    },
    rejectionReason: String,
    requestedAt: { type: Date, default: Date.now },
    reviewedAt: Date,
    reviewedBy: String
  },
  { timestamps: true }
);

export const UserRequestModel = models.UserRequest || model("UserRequest", userRequestSchema);
