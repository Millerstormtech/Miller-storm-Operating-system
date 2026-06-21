require('dotenv').config();
const mongoose = require('mongoose');

const ChatGroupSchema = new mongoose.Schema({
  name: String,
  description: String,
  imageUrl: String,
  members: [String],
  admins: [String],
  onlyAdminCanChat: Boolean,
  createdBy: String,
  createdAt: Date,
  updatedAt: Date
});

const ChatGroup = mongoose.models.ChatGroup || mongoose.model('ChatGroup', ChatGroupSchema);

async function checkGroups() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const groups = await ChatGroup.find();
    console.log(`📁 Found ${groups.length} groups:\n`);

    groups.forEach((group, index) => {
      console.log(`Group ${index + 1}:`);
      console.log(`  Name: ${group.name}`);
      console.log(`  Description: ${group.description}`);
      console.log(`  Image: ${group.imageUrl}`);
      console.log(`  Members: ${group.members.length} users`);
      console.log(`  Member IDs: ${JSON.stringify(group.members)}`);
      console.log(`  Admins: ${group.admins.length} users`);
      console.log(`  Admin IDs: ${JSON.stringify(group.admins)}`);
      console.log(`  Only Admin Can Chat: ${group.onlyAdminCanChat}`);
      console.log(`  Created By: ${group.createdBy}`);
      console.log(`  Created At: ${group.createdAt}`);
      console.log('');
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkGroups();
