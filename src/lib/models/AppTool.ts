import mongoose from 'mongoose';

export interface IAppTool {
  _id?: string;
  title: string;
  imageUrl: string;
  imageWidth?: number;
  imageHeight?: number;
  description: string;
  link: string;
  webLink?: string;
  appStoreLink?: string;
  playStoreLink?: string;
  categoryId: mongoose.Types.ObjectId | string;
  status?: 'draft' | 'published';
  createdAt?: Date;
  updatedAt?: Date;
}

const AppToolSchema = new mongoose.Schema<IAppTool>(
  {
    title: { type: String, required: true },
    imageUrl: { type: String, default: '' },
    imageWidth: { type: Number, default: 400 },
    imageHeight: { type: Number, default: 300 },
    description: { type: String, default: '' },
    link: { type: String, default: '' },
    webLink: { type: String, default: '' },
    appStoreLink: { type: String, default: '' },
    playStoreLink: { type: String, default: '' },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'AppToolCategory', required: true },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' }
  },
  { timestamps: true }
);

export default mongoose.models.AppTool || mongoose.model<IAppTool>('AppTool', AppToolSchema);
