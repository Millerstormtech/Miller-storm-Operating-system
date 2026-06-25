import { Schema, model, models } from "mongoose";

// Support ticket raised by a sales/manager/marketing user. Admins review and
// move it through the status flow; each transition emails + notifies the user.
const ticketSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true }, // who raised it
    name: { type: String, required: true },
    email: { type: String, required: true },
    role: { type: String, default: "" },
    type: { type: String, enum: ["bug", "feature", "other"], default: "other" },
    note: { type: String, default: "" },
    status: {
      type: String,
      enum: ["open", "approved", "in_progress", "completed", "rejected"],
      default: "open",
    },
    adminNote: { type: String, default: "" },
  },
  { timestamps: true }
);

export const TicketModel = models.Ticket || model("Ticket", ticketSchema);
