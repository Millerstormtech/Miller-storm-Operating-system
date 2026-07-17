import mongoose, { Schema, Document } from 'mongoose';

// A request from a user to join a PRIVATE StormChat group. The group's admin
// approves or denies it; on approval the user is added to the group's members.
export interface IGroupJoinRequest extends Document {
  groupId: string;       // ChatGroup _id (string)
  groupName: string;
  userId: string;        // requester's Mongo _id (string) — matches group.members
  appUserId: string;     // requester's app id (auth.sub), for notifications
  userName: string;
  userRole: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: Date;
  updatedAt: Date;
}

const GroupJoinRequestSchema = new Schema<IGroupJoinRequest>(
  {
    groupId: { type: String, required: true, index: true },
    groupName: { type: String, default: '' },
    userId: { type: String, required: true },
    appUserId: { type: String, default: '' },
    userName: { type: String, default: '' },
    userRole: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'denied'], default: 'pending', index: true },
  },
  { timestamps: true }
);

// One live request per (group, user): re-requesting updates the same row.
GroupJoinRequestSchema.index({ groupId: 1, userId: 1 }, { unique: true });

export default mongoose.models.GroupJoinRequest ||
  mongoose.model<IGroupJoinRequest>('GroupJoinRequest', GroupJoinRequestSchema);
