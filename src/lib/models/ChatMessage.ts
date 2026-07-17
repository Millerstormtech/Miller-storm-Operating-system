import mongoose, { Schema, Document } from 'mongoose';

interface IReaction {
  emoji: string;
  userId: string;
  userName: string;
}

interface IPollOption {
  text: string;
  votes: string[]; // userIds who picked this option
}

interface IPoll {
  question: string;
  options: IPollOption[];
  allowMultiple: boolean;
}

export interface IChatMessage extends Document {
  groupId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  message: string;
  messageType: 'text' | 'image' | 'video' | 'file' | 'poll' | 'system';
  mediaUrl?: string;
  poll?: IPoll;
  replyTo?: string;
  replyToMessage?: string;
  replyToSender?: string;
  mentions?: string[];
  reactions?: IReaction[];
  createdAt: Date;
  updatedAt: Date;
}

const ReactionSchema = new Schema<IReaction>(
  {
    emoji: { type: String, required: true },
    userId: { type: String, required: true },
    userName: { type: String, required: true },
  },
  { _id: false }
);

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    groupId: { type: String, required: true, index: true },
    senderId: { type: String, required: true },
    senderName: { type: String, required: true },
    senderRole: { type: String, required: true },
    message: { type: String, default: '' },
    messageType: {
      type: String,
      enum: ['text', 'image', 'video', 'file', 'poll', 'system'],
      default: 'text'
    },
    mediaUrl: { type: String, default: '' },
    poll: {
      type: new Schema<IPoll>(
        {
          question: { type: String, required: true },
          options: {
            type: [new Schema<IPollOption>({ text: { type: String, required: true }, votes: { type: [String], default: [] } }, { _id: false })],
            default: [],
          },
          allowMultiple: { type: Boolean, default: false },
        },
        { _id: false }
      ),
      default: undefined,
    },
    replyTo: { type: String },
    replyToMessage: { type: String },
    replyToSender: { type: String },
    mentions: { type: [String], default: [] },
    reactions: { type: [ReactionSchema], default: [] }
  },
  { timestamps: true }
);

ChatMessageSchema.index({ groupId: 1, createdAt: -1 });
// Supports the per-group mention-count aggregation (mention-counts.ts), which
// matches on groupId + mentions and bounds by createdAt. `mentions` is an array,
// so this is a multikey index.
ChatMessageSchema.index({ groupId: 1, mentions: 1, createdAt: -1 });

// Next.js dev keeps the mongoose singleton alive across hot reloads, so a model
// compiled before a schema change (e.g. adding the 'poll' messageType) stays
// cached with the OLD schema and rejects the new value — a browser refresh alone
// won't fix it. Drop the stale model in dev so schema edits take effect without a
// full server restart. Production compiles once from a fresh build, so it's a no-op.
if (process.env.NODE_ENV !== 'production') {
  delete (mongoose.models as any).ChatMessage;
  delete ((mongoose.connection && (mongoose.connection as any).models) || {}).ChatMessage;
}

export default mongoose.models.ChatMessage || mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);
