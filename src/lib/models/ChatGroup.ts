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
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.models.ChatGroup || mongoose.model<IChatGroup>('ChatGroup', ChatGroupSchema);
