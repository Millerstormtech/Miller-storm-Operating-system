import mongoose, { Schema, Document } from 'mongoose';

export interface IGroupReadReceipt extends Document {
  userId: string;
  groupId: string;
  lastReadAt: Date;
}

const GroupReadReceiptSchema = new Schema<IGroupReadReceipt>({
  userId: { type: String, required: true },
  groupId: { type: String, required: true },
  lastReadAt: { type: Date, required: true, default: Date.now }
}, {
  timestamps: true
});

// Create compound index for efficient queries
GroupReadReceiptSchema.index({ userId: 1, groupId: 1 }, { unique: true });

export default mongoose.models.GroupReadReceipt || mongoose.model<IGroupReadReceipt>('GroupReadReceipt', GroupReadReceiptSchema);
