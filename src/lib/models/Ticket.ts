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
    // A support category key (see src/lib/support/categories.ts). No enum so
    // categories can change without a schema migration; old tickets keep their
    // legacy bug/feature/other values.
    type: { type: String, default: "billing" },
    // Predefined per-category field values (Acculynx Job#, Amount, MSRR tool…).
    fields: { type: Schema.Types.Mixed, default: {} },
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
