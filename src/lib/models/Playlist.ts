import mongoose, { Schema, Document } from 'mongoose';

export interface IPlaylist extends Document {
  name: string;
  courseId: string;
  courseName: string;
  selectedModules: string[];
  managerId: string;
  managerName: string;
  createdAt: Date;
  updatedAt: Date;
}

const PlaylistSchema = new Schema<IPlaylist>(
  {
    name: { type: String, required: true },
    courseId: { type: String, required: true },
    courseName: { type: String, required: true },
    selectedModules: [{ type: String }],
    managerId: { type: String, required: true },
    managerName: { type: String, required: true },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.Playlist || mongoose.model<IPlaylist>('Playlist', PlaylistSchema);
