import mongoose from 'mongoose';

const PlaylistAssignmentSchema = new mongoose.Schema({
  playlistId: { type: String, required: true },
  playlistName: { type: String, required: true },
  courseId: { type: String, required: true },
  courseName: { type: String, required: true },
  selectedModules: [{ type: String }],
  managerId: { type: String, required: true },
  managerName: { type: String, required: true },
  assignedToUserId: { type: String, required: true },
  assignedToUserName: { type: String, required: true },
  deadline: { type: Date },
  deadlineNotified: { type: Boolean, default: false },
  completedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.PlaylistAssignment || mongoose.model('PlaylistAssignment', PlaylistAssignmentSchema);
