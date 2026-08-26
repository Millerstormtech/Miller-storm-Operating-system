import { Schema, model, models } from "mongoose";

// One message in a ticket's back-and-forth conversation. Either side (the user
// who raised it or an admin/handler) can post; both sides see the whole thread.
const ticketMessageSchema = new Schema(
  {
    senderId: { type: String, required: true },
    senderName: { type: String, default: "" },
    senderRole: { type: String, default: "" },
    // true when an admin/handler wrote it (renders on the "support" side).
    fromStaff: { type: Boolean, default: false },
    // Text is optional when the message is a photo/video attachment.
    text: { type: String, default: "" },
    // Optional photo/video attachment (URL from /api/upload-image) + its kind.
    mediaUrl: { type: String, default: "" },
    mediaType: { type: String, default: "" }, // 'image' | 'video'
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

// Support ticket raised by a sales/manager/marketing user. Admins review and
// move it through the status flow; each transition emails + notifies the user.
// The `messages` thread lets the raiser and the handler talk back and forth, and
// everyone involved follows the same status from inside the app.
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
    // Back-and-forth conversation between the raiser and the handler/admin.
    messages: { type: [ticketMessageSchema], default: [] },
  },
  { timestamps: true }
);

// In development, Next.js keeps the Node process alive across hot reloads, so a
// previously-registered model would keep its OLD schema — e.g. missing the new
// `messages` field, which made admin replies silently fail to save. Drop the
// cached model in dev so the current schema always wins. Production registers
// once and reuses it normally.
if (process.env.NODE_ENV !== "production" && (models as any).Ticket) {
  delete (models as any).Ticket;
}

export const TicketModel = models.Ticket || model("Ticket", ticketSchema);
