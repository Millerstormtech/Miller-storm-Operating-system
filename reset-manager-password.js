const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = 'mongodb://localhost:27017/millerstorm';

const userSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
const User = mongoose.model('User', userSchema);

async function resetPassword() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('=== RESETTING MANAGER PASSWORD ===\n');

    const newPassword = 'brook1234';
    const newHash = await bcrypt.hash(newPassword, 10);
    
    console.log('New password:', newPassword);
    console.log('New hash:', newHash);
    console.log('Hash length:', newHash.length);
    
    const result = await User.updateOne(
      { email: 'brooke.taylor@company.com' },
      { $set: { passwordHash: newHash } }
    );
    
    console.log('\nUpdate result:', result);
    
    // Verify
    const user = await User.findOne({ email: 'brooke.taylor@company.com' }).lean();
    const match = await bcrypt.compare(newPassword, user.passwordHash);
    
    console.log('\n=== VERIFICATION ===');
    console.log('Password matches after update:', match);
    
    if (match) {
      console.log('\n✓ SUCCESS! You can now login with:');
      console.log('  Email: brooke.taylor@company.com');
      console.log('  Password: brook1234');
    } else {
      console.log('\n❌ FAILED! Password still does not match.');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

resetPassword();
