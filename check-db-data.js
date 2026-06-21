const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/millerstorm";

async function checkData() {
  await mongoose.connect(uri, { dbName: "millerstorm" });
  
  const users = await mongoose.connection.db.collection('users').find({}).toArray();
  
  console.log('=== DATABASE USERS ===');
  console.log(JSON.stringify(users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    roles: u.roles,
    managerId: u.managerId,
    businessPlan: u.businessPlan
  })), null, 2));
  
  await mongoose.disconnect();
}

checkData().catch(console.error);
