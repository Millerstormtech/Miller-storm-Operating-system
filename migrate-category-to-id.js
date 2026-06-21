const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

async function migrateCategoryToId() {
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db();
    
    console.log('🔄 Starting migration: category (string) -> categoryId (ObjectId)');
    console.log('');
    
    // Get all categories
    const categories = await db.collection('apptoolcategories').find({}).toArray();
    console.log(`📁 Found ${categories.length} categories`);
    categories.forEach(cat => {
      console.log(`   - ${cat.name} (${cat.slug}) - ID: ${cat._id}`);
    });
    console.log('');
    
    // Get all items
    const items = await db.collection('apptools').find({}).toArray();
    console.log(`📦 Found ${items.length} items to migrate`);
    console.log('');
    
    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const item of items) {
      try {
        // Check if item already has categoryId
        if (item.categoryId) {
          console.log(`✓ Item "${item.title}" already has categoryId, skipping`);
          skipped++;
          continue;
        }
        
        // Get the old category field
        const oldCategory = item.category;
        if (!oldCategory) {
          console.log(`⚠ Item "${item.title}" has no category field, skipping`);
          skipped++;
          continue;
        }
        
        // Find category by slug or name
        let category = categories.find(cat => cat.slug === oldCategory);
        if (!category) {
          category = categories.find(cat => cat.name === oldCategory);
        }
        
        if (!category) {
          console.log(`❌ Category not found for item "${item.title}" with category "${oldCategory}"`);
          errors++;
          continue;
        }
        
        // Update item with categoryId
        await db.collection('apptools').updateOne(
          { _id: item._id },
          { 
            $set: { categoryId: category._id },
            $unset: { category: 1 }
          }
        );
        
        console.log(`✅ Migrated "${item.title}": "${oldCategory}" -> ${category._id}`);
        migrated++;
      } catch (error) {
        console.error(`❌ Error migrating item "${item.title}":`, error.message);
        errors++;
      }
    }
    
    console.log('');
    console.log('=== Migration Complete ===');
    console.log(`✅ Migrated: ${migrated}`);
    console.log(`⏭️  Skipped: ${skipped}`);
    console.log(`❌ Errors: ${errors}`);
    console.log(`📊 Total: ${items.length}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

migrateCategoryToId();
