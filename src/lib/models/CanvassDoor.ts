// src/lib/models/CanvassDoor.ts
import { Schema, model, models } from "mongoose";

// One RepCard door (a RepCard "customer") on the Canvass Map: where it is, its
// current status and its knock history. Loaded by scripts/canvass-doors.ts through
// the pure mapper in src/lib/canvass/doors.ts.
//
// Deliberately NOT stored: the homeowner's name, email, phone, notes, attachments
// and custom fields (spec B8). Rep names ARE kept: the house card shows who knocked.
const knockSchema = new Schema(
  {
    at: { type: Date, required: true },
    status: { type: String, default: "" },
    userId: { type: Number, default: null },
    rep: { type: String, default: "" },
    verified: { type: Boolean, default: false }, // RepCard's own GPS check of the knock
  },
  { _id: false }
);

const statusChangeSchema = new Schema(
  {
    at: { type: Date, required: true },
    from: { type: String, default: "" },
    to: { type: String, default: "" },
    userId: { type: Number, default: null },
    rep: { type: String, default: "" },
  },
  { _id: false }
);

const canvassDoorSchema = new Schema(
  {
    doorId: { type: Number, required: true }, // RepCard customer id
    houseId: { type: String, default: "" },
    // Absent when RepCard has no usable position (a null point would break the 2dsphere index).
    location: {
      type: { type: String, enum: ["Point"] },
      coordinates: { type: [Number], default: undefined }, // [longitude, latitude]
    },
    address: {
      line: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      zip: { type: String, default: "" },
    },
    contactType: { type: String, default: "" }, // Lead, Customer, Other
    status: { type: String, default: "" }, // current status label, e.g. "Not Interested"
    statusAt: { type: Date, default: null },
    statusAtSource: { type: String, enum: ["log", "knock", "updated"], default: null }, // where statusAt came from
    ownerUserId: { type: Number, default: null },
    knocks: { type: [knockSchema], default: [] },
    statusChanges: { type: [statusChangeSchema], default: [] },
    doorCreatedAt: { type: Date, default: null },
    doorUpdatedAt: { type: Date, default: null },
    // The house this door sits on, when one is close enough (set by the matching step).
    homeId: { type: Schema.Types.ObjectId, default: null },
    matchMeters: { type: Number, default: null },
    loadedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

canvassDoorSchema.index({ doorId: 1 }, { unique: true });
canvassDoorSchema.index({ location: "2dsphere" });
canvassDoorSchema.index({ homeId: 1 });

export const CanvassDoorModel = models.CanvassDoor || model("CanvassDoor", canvassDoorSchema, "canvass_doors");
