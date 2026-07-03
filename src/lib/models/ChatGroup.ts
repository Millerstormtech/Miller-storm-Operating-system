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
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.models.ChatGroup || mongoose.model<IChatGroup>('ChatGroup', ChatGroupSchema);
