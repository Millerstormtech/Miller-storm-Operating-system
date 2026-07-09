import mongoose, { Schema, Document } from 'mongoose';

export interface IChatGroup extends Document {
  name: string;
  description: string;
  imageUrl: string;
  members: string[];
  admins: string[];
  onlyAdminCanChat: boolean;
  createdBy: string;
  order: number;
  // When set, this group is a SUBGROUP nested under the parent group's _id.
  // Empty/absent = a top-level group.
  parentGroupId: string;
  // A direct (1-on-1) private message thread: exactly 2 members, no name, never
  // shown in the admin group list, and readable ONLY by its two members.
  isDirect: boolean;
  // Canonical key for a DM = the two member ids sorted and joined ("a__b").
  // Uniquely identifies the pair so a second DM between them is never created.
  // Left UNSET on normal groups so the sparse unique index ignores them.
  dmKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ChatGroupSchema = new Schema<IChatGroup>(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    imageUrl: {
      type: String,
      default: ''
    },
    members: [{
      type: String,
      required: true
    }],
    admins: [{
      type: String
    }],
    onlyAdminCanChat: {
      type: Boolean,
      default: false
    },
    createdBy: {
      type: String,
      required: true
    },
    order: {
      type: Number,
      default: 0
    },
    parentGroupId: {
      type: String,
      default: '',
      index: true
    },
    isDirect: {
      type: Boolean,
      default: false,
      index: true
    },
    dmKey: {
      type: String,
      // No default → unset on normal groups so the sparse unique index skips
      // them (only DMs carry a dmKey, and each pair's key is unique).
      index: { unique: true, sparse: true }
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.models.ChatGroup || mongoose.model<IChatGroup>('ChatGroup', ChatGroupSchema);
