const mongoose = require('mongoose');

const mongoUri = process.env.MONGODB_URI || 'mongodb://dsatguru:vivekVOra32%2B@69.62.66.123:27017/millerstorm?authSource=admin';

async function debugSocialMetrics() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Check if collection exists
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));

    // Get the model
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

    // Check existing data
    const existingMetrics = await SocialMediaMetricsModel.find({});
    console.log('Existing metrics in database:', existingMetrics);
    console.log('Count:', existingMetrics.length);

    // Try to insert a test metric
    console.log('\nTesting insert...');
    const testMetric = {
      id: `social-test-${Date.now()}`,
      platform: 'test-platform',
      platformName: 'Test Platform',
      icon: '🧪',
      followers: 100,
      posts30d: 5,
      views30d: 1000
    };

    const result = await SocialMediaMetricsModel.create(testMetric);
    console.log('Test metric created:', result);

    // Verify it was saved
    const verifyMetric = await SocialMediaMetricsModel.findOne({ id: testMetric.id });
    console.log('Verified metric:', verifyMetric);

    // Clean up test
    await SocialMediaMetricsModel.deleteOne({ id: testMetric.id });
    console.log('Test metric deleted');

    await mongoose.connection.close();
    console.log('Connection closed');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debugSocialMetrics();
