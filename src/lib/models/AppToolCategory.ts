import mongoose, { Schema, Document } from 'mongoose';

export interface IAppToolCategory extends Document {
  name: string;
  slug: string;
  order: number;
  status: 'draft' | 'published';
  createdAt: Date;
  updatedAt: Date;
}

const AppToolCategorySchema = new Schema<IAppToolCategory>(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    order: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'draft'
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.models.AppToolCategory || mongoose.model<IAppToolCategory>('AppToolCategory', AppToolCategorySchema);
