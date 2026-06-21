import mongoose from 'mongoose';

export interface IMarketingMaterial {
  _id?: string;
  courseId: string;
  courseName: string;
  pageId: string;
  pageName: string;
  type: 'image' | 'video' | 'url';
  url: string;
  title?: string;
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const MarketingMaterialSchema = new mongoose.Schema<IMarketingMaterial>(
  {
    courseId: { type: String, required: true },
    courseName: { type: String, required: true },
    pageId: { type: String, required: true },
    pageName: { type: String, required: true },
    type: { type: String, enum: ['image', 'video', 'url'], required: true },
    url: { type: String, required: true },
    title: { type: String, default: '' },
    description: { type: String, default: '' }
  },
  { timestamps: true }
);

MarketingMaterialSchema.index({ courseId: 1, pageId: 1 });

export default mongoose.models.MarketingMaterial || mongoose.model<IMarketingMaterial>('MarketingMaterial', MarketingMaterialSchema);
