import { connectMongo } from '../src/lib/mongodb';
import AppTool from '../src/lib/models/AppTool';
import AppToolCategory from '../src/lib/models/AppToolCategory';

async function migrateCategoryToId() {
  try {
    await connectMongo();
    console.log('Connected to MongoDB');

    // Get all items
    const items = await AppTool.find({});
    console.log(`Found ${items.length} items to migrate`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const item of items) {
      try {
        // Check if item already has categoryId
        if (item.categoryId) {
          console.log(`Item ${item._id} already has categoryId, skipping`);
          skipped++;
          continue;
        }

        // Get the old category field (it might be stored as 'category')
        const oldCategory = (item as any).category;
        if (!oldCategory) {
          console.log(`Item ${item._id} has no category field, skipping`);
          skipped++;
          continue;
        }

        // Find category by slug or name
        let category = await AppToolCategory.findOne({ slug: oldCategory });
        if (!category) {
          category = await AppToolCategory.findOne({ name: oldCategory });
        }

        if (!category) {
          console.log(`Category not found for item ${item._id} with category "${oldCategory}"`);
          errors++;
          continue;
        }

        // Update item with categoryId
        await AppTool.updateOne(
          { _id: item._id },
          { 
            $set: { categoryId: category._id },
            $unset: { category: 1 }
          }
        );

        console.log(`Migrated item ${item._id}: "${oldCategory}" -> ${category._id}`);
        migrated++;
      } catch (error) {
        console.error(`Error migrating item ${item._id}:`, error);
        errors++;
      }
    }

    console.log('\n=== Migration Complete ===');
    console.log(`Migrated: ${migrated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);
    console.log(`Total: ${items.length}`);

    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrateCategoryToId();
