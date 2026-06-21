# Dynamic Apps & Tools Categories Feature

## Overview
The Apps & Tools section in the admin panel is now fully dynamic with category management. Admins can create, edit, and delete custom categories instead of being limited to hardcoded "Apps", "Tools", and "Other" sections.

## What Changed

### 1. **Dynamic Category Management**
- ✅ **Create Category Button** at the top of the page
- ✅ **Edit Category** - rename any category
- ✅ **Delete Category** - remove categories (only if empty)
- ✅ **Custom Category Names** - create any category you want (e.g., "Resources", "Utilities", "Integrations")

### 2. **New Features**
- **Category Management Panel** - dedicated section at the top with "+ Create Category" button
- **Edit/Delete Buttons** - each category has edit and delete options
- **Smart Delete Protection** - cannot delete categories that have items in them
- **Auto-slug Generation** - category names automatically convert to URL-friendly slugs
- **Order Management** - categories maintain their order

### 3. **Files Created**

#### Frontend:
- `src/portals/admin/AppsToolsDynamic.tsx` - New dynamic component with category management
- Deleted: `src/portals/admin/AppsTools.tsx` - Old hardcoded version

#### Backend APIs:
- `pages/api/apps-tools/categories/index.ts` - GET all categories, POST create category
- `pages/api/apps-tools/categories/[id].ts` - PUT update category, DELETE category

#### Database:
- `src/lib/models/AppToolCategory.ts` - MongoDB model for categories

#### Migration:
- `migrate-app-categories.js` - Script to create default categories from existing data

## How to Use

### Step 1: Run Migration (First Time Only)
```bash
node migrate-app-categories.js
```

This creates the default categories:
- Apps
- Tools  
- Other

### Step 2: Access Admin Panel
1. Go to `https://millerstorm.tech/admin/apps-tools`
2. You'll see the new **Category Management** section at the top

### Step 3: Create New Categories
1. Click **"+ Create Category"** button
2. Enter category name (e.g., "Resources", "Integrations", "Utilities")
3. Click **Create**
4. New category section appears below

### Step 4: Edit Categories
1. Click **"✏️ Edit"** button next to any category name
2. Change the name
3. Click **Save**

### Step 5: Delete Categories
1. Click **"🗑️ Delete"** button next to category name
2. Confirm deletion
3. Note: Cannot delete if category has items - must delete/move items first

### Step 6: Add Items to Categories
1. Each category has **"+ Create [Category]"** button
2. Click to add new app/tool to that category
3. Fill in details (title, image, description, links)
4. All items support:
   - Web Link
   - App Store Link (iOS)
   - Play Store Link (Android)

## Database Schema

### AppToolCategory Collection
```typescript
{
  _id: ObjectId,
  name: string,        // Display name (e.g., "Apps")
  slug: string,        // URL-friendly (e.g., "apps")
  order: number,       // Display order
  createdAt: Date,
  updatedAt: Date
}
```

### AppTool Collection (Updated)
```typescript
{
  _id: ObjectId,
  title: string,
  imageUrl: string,
  imageWidth: number,
  imageHeight: number,
  description: string,
  link: string,
  webLink: string,
  appStoreLink: string,
  playStoreLink: string,
  category: string,    // Changed from enum to string (slug)
  createdAt: Date,
  updatedAt: Date
}
```

## API Endpoints

### Categories
- `GET /api/apps-tools/categories` - Get all categories
- `POST /api/apps-tools/categories` - Create new category
- `PUT /api/apps-tools/categories/[id]` - Update category
- `DELETE /api/apps-tools/categories/[id]` - Delete category

### Items (Existing, unchanged)
- `GET /api/apps-tools` - Get all items
- `POST /api/apps-tools` - Create new item
- `PUT /api/apps-tools/[id]` - Update item
- `DELETE /api/apps-tools/[id]` - Delete item

## Benefits

1. **Flexibility** - Create any category structure you need
2. **Scalability** - Add unlimited categories
3. **Organization** - Better organize apps and tools by purpose
4. **User-Friendly** - Intuitive UI with edit/delete options
5. **Safe** - Cannot accidentally delete categories with items

## Example Use Cases

### Before (Hardcoded):
- Apps
- Tools
- Other

### After (Dynamic):
- Apps
- Tools
- Integrations
- Resources
- Utilities
- Training Materials
- Marketing Tools
- Sales Tools
- Custom Category 1
- Custom Category 2
- ... (unlimited)

## Migration Notes

- Existing apps/tools data is preserved
- Default categories (Apps, Tools, Other) are created automatically
- Existing items remain in their original categories
- No data loss during migration

## Testing Checklist

- [x] Build successful
- [ ] Run migration script
- [ ] Create new category
- [ ] Edit category name
- [ ] Delete empty category
- [ ] Try to delete category with items (should fail)
- [ ] Add item to custom category
- [ ] Edit item in custom category
- [ ] Delete item from custom category
- [ ] Verify categories persist after page refresh

## Deployment Steps

1. **Push code to repository**
   ```bash
   git add .
   git commit -m "feat: dynamic categories for Apps & Tools"
   git push origin main
   ```

2. **On server:**
   ```bash
   cd /var/www/millerstorm
   git pull origin main
   npm install
   npm run build
   node migrate-app-categories.js
   pm2 restart millerstorm
   ```

3. **Verify:**
   - Visit https://millerstorm.tech/admin/apps-tools
   - Check category management section appears
   - Test creating a new category

## Support

If you encounter any issues:
1. Check browser console for errors
2. Check server logs: `pm2 logs millerstorm`
3. Verify MongoDB connection
4. Ensure migration script ran successfully

---

**Status:** ✅ Ready for deployment
**Build:** ✅ Successful
**Migration Script:** ✅ Created
