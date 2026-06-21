import { useState, useEffect } from "react";
import Link from "next/link";

type AppToolCategory = {
  _id: string;
  name: string;
  slug: string;
  order: number;
  status: 'draft' | 'published';
};

type AppToolItem = {
  _id: string;
  title: string;
  imageUrl: string;
  imageWidth?: number;
  imageHeight?: number;
  description: string;
  link: string;
  webLink?: string;
  appStoreLink?: string;
  playStoreLink?: string;
  category: string; // Dynamic category
};

export function AppsToolsViewer({ portal = 'sales' }: { portal?: 'sales' | 'manager' | 'marketing' }) {
  const [categories, setCategories] = useState<AppToolCategory[]>([]);
  const [itemsByCategory, setItemsByCategory] = useState<Record<string, AppToolItem[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      // Fetch categories
      const categoriesResponse = await fetch('/api/apps-tools/categories');
      const categoriesData = await categoriesResponse.json();
      
      // Filter only published categories
      const publishedCategories = categoriesData.filter((cat: AppToolCategory) => cat.status === 'published');
      
      // Fetch all published items
      const itemsResponse = await fetch('/api/apps-tools?published=true');
      const itemsData = await itemsResponse.json();
      
      // Group items by category
      const grouped: Record<string, AppToolItem[]> = {};
      itemsData.forEach((item: AppToolItem) => {
        if (!grouped[item.category]) {
          grouped[item.category] = [];
        }
        grouped[item.category].push(item);
      });
      
      setCategories(publishedCategories.sort((a: AppToolCategory, b: AppToolCategory) => a.order - b.order));
      setItemsByCategory(grouped);
    } catch (error) {
      console.error('Error fetching apps/tools:', error);
    } finally {
      setLoading(false);
    }
  }

  function renderSection(category: AppToolCategory) {
    const items = itemsByCategory[category.slug] || [];
    
    if (items.length === 0) return null;

    return (
      <div key={category._id} className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <span>{category.name}</span>
        </div>
        <div className="panel-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {items.map((item) => (
              <Link key={item._id} href={`/${portal}/apps-tools/${item._id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="card" style={{ padding: 0, overflow: "hidden", cursor: "pointer", transition: "transform 0.2s", height: "100%" }}>
                  <div style={{ 
                    width: "100%", 
                    height: item.imageHeight ? Math.round(item.imageHeight * 0.8) : 224, 
                    backgroundImage: item.imageUrl && !item.imageUrl.startsWith('blob:') ? `url(${item.imageUrl})` : 'none',
                    backgroundColor: '#f3f4f6',
                    backgroundSize: "cover", 
                    backgroundPosition: "center",
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#9ca3af',
                    fontSize: 14
                  }}>
                    {(!item.imageUrl || item.imageUrl.startsWith('blob:')) && 'No Image'}
                  </div>
                  <div style={{ padding: 16, textAlign: "center" }}>
                    <div className="card-title" style={{ marginBottom: 0, fontSize: 16, fontWeight: 600 }}>{item.title}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Loading...</div>;
  }

  if (categories.length === 0) {
    return (
      <div className="panel">
        <div className="panel-body">
          <div className="panel-empty">No apps or tools available yet.</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {categories.map(category => renderSection(category))}
    </div>
  );
}
