require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');

const AppToolCategorySchema = new mongoose.Schema({
  name: String,
  slug: String,
  order: Number
}, { timestamps: true });

const AppToolCategory = mongoose.models.AppToolCategory || mongoose.model('AppToolCategory', AppToolCategorySchema);

async function migrateCategories() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if categories already exist
    const existingCategories = await AppToolCategory.find();
    
    if (existingCategories.length > 0) {
      console.log(`📁 Found ${existingCategories.length} existing categories:`);
      existingCategories.forEach(cat => {
        console.log(`   - ${cat.name} (${cat.slug})`);
      });
      console.log('\n✅ Categories already exist. No migration needed.');
      process.exit(0);
    }

    // Create default categories
    const defaultCategories = [
      { name: 'Apps', slug: 'apps', order: 0 },
      { name: 'Tools', slug: 'tools', order: 1 },
      { name: 'Other', slug: 'other', order: 2 }
    ];

    console.log('📁 Creating default categories...');
    
    for (const category of defaultCategories) {
      const created = await AppToolCategory.create(category);
      console.log(`   ✅ Created: ${created.name} (${created.slug})`);
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('📝 You can now create custom categories from the admin panel.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrateCategories();
