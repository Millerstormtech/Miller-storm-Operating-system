const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = 'mongodb://localhost:27017/millerstorm';

const userSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
const User = mongoose.model('User', userSchema);

async function debugManagerLogin() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('=== MANAGER LOGIN DEBUG ===\n');

    const user = await User.findOne({ email: 'brooke.taylor@company.com' }).lean();
    
    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('User found:');
    console.log('- ID:', user.id);
    console.log('- Name:', user.name);
    console.log('- Email:', user.email);
    console.log('- Role:', user.role);
    console.log('- Suspended:', user.suspended);
    console.log('- Has passwordHash:', !!user.passwordHash);
    console.log('- passwordHash length:', user.passwordHash?.length);
    console.log('- passwordHash starts with $2:', user.passwordHash?.startsWith('$2'));
    
    console.log('\n=== PASSWORD TEST ===');
    const testPassword = 'brook1234';
    
    try {
      const match = await bcrypt.compare(testPassword, user.passwordHash);
      console.log(`Password "${testPassword}" matches:`, match);
    } catch (err) {
      console.log('❌ Error comparing password:', err.message);
    }

    // Try with trimmed password
    try {
      const matchTrimmed = await bcrypt.compare(testPassword.trim(), user.passwordHash);
      console.log(`Password "${testPassword.trim()}" (trimmed) matches:`, matchTrimmed);
    } catch (err) {
      console.log('❌ Error comparing trimmed password:', err.message);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

debugManagerLogin();
