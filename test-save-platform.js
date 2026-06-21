const mongoose = require('mongoose');

const mongoUri = process.env.MONGODB_URI || 'mongodb://dsatguru:vivekVOra32%2B@69.62.66.123:27017/millerstorm?authSource=admin';

async function testSavePlatform() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const socialMediaMetricsSchema = new mongoose.Schema(
      {
        id: { type: String, required: true, unique: true },
        platform: { type: String, required: true },
        platformName: { type: String, required: true },
        icon: { type: String, default: "📱" },
        followers: { type: Number, required: true, default: 0 },
        posts30d: { type: Number, required: true, default: 0 },
        views30d: { type: Number, required: true, default: 0 },
        lastUpdated: { type: Date, default: Date.now }
      },
      { timestamps: true }
    );

    const SocialMediaMetricsModel = mongoose.models.SocialMediaMetrics || mongoose.model('SocialMediaMetrics', socialMediaMetricsSchema);

    // Test adding a new platform
    console.log('\n=== TESTING NEW PLATFORM SAVE ===');
    
    const newPlatform = {
      id: `social-linkedin-${Date.now()}`,
      platform: 'linkedin',
      platformName: 'LinkedIn',
      icon: 'in',
      followers: 1000,
      posts30d: 15,
      views30d: 5000
    };

    console.log('Adding new platform:', newPlatform);
    
    const result = await SocialMediaMetricsModel.findOneAndUpdate(
      { id: newPlatform.id },
      newPlatform,
      { upsert: true, new: true }
    );

    console.log('Save result:', result);

    // Verify it was saved
    const verify = await SocialMediaMetricsModel.findOne({ id: newPlatform.id });
    console.log('Verified saved platform:', verify);

    // List all platforms
    const allMetrics = await SocialMediaMetricsModel.find({});
    console.log('\nAll platforms in database:');
    allMetrics.forEach(m => {
      console.log(`- ${m.platformName} (${m.icon}): ${m.followers} followers, ${m.posts30d} posts, ${m.views30d} views`);
    });

    await mongoose.connection.close();
    console.log('\nConnection closed');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testSavePlatform();
