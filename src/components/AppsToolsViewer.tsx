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

// Decorative gradient placeholders for cards without an image — cycled by index.
// Rgba over the card surface so they read as pastel in light mode and as dark
// tints in dark mode automatically.
const GRADS = [
  "linear-gradient(155deg, rgba(224,20,24,0.22), rgba(224,20,24,0.03))",
  "linear-gradient(155deg, rgba(120,140,185,0.22), rgba(120,140,185,0.03))",
  "linear-gradient(155deg, rgba(150,150,160,0.18), rgba(150,150,160,0.03))",
  "linear-gradient(155deg, rgba(224,20,24,0.14), rgba(120,140,185,0.06))",
];

export function AppsToolsViewer({ portal = 'sales' }: { portal?: 'sales' | 'manager' | 'marketing' }) {
  const [categories, setCategories] = useState<AppToolCategory[]>([]);
  const [itemsByCategory, setItemsByCategory] = useState<Record<string, AppToolItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

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
    const q = search.trim().toLowerCase();
    const items = (itemsByCategory[category.slug] || []).filter(
      (i) => !q || (i.title || "").toLowerCase().includes(q)
    );

    if (items.length === 0) return null;

    return (
      <div key={category._id} style={{ marginBottom: 30 }}>
        <div className="at-section-title">{category.name}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 18 }}>
          {items.map((item, i) => {
            const hasImg = item.imageUrl && !item.imageUrl.startsWith('blob:');
            return (
              <Link key={item._id} href={`/${portal}/apps-tools/${item._id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="at-card">
                  <div
                    className="at-thumb"
                    style={{
                      backgroundImage: hasImg ? `url(${item.imageUrl})` : GRADS[i % GRADS.length],
                      backgroundColor: hasImg ? 'var(--surface-subtle)' : undefined,
                    }}
                  />
                  <div className="at-label">{item.title}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading tools…</div>;
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
    <div style={{ position: "relative", maxWidth: 1240, margin: 0 }}>
      {/* Faded brand watermark behind the grid. */}
      <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: "url(/ChatGPT_Image_Feb_23__2026__07_00_52_PM-removebg-preview.png)", backgroundRepeat: "no-repeat", backgroundPosition: "center 24%", backgroundSize: "min(760px, 62%)", opacity: 0.05, pointerEvents: "none", zIndex: 0 }} />

      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14.5, color: "var(--text-muted)" }}>Everything you need in the field</div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tools"
            style={{ padding: "11px 20px", borderRadius: 999, border: "1px solid var(--border-default)", background: "var(--surface-default)", color: "var(--text-primary)", fontSize: 14, outline: "none", minWidth: 220 }}
          />
        </div>

        {categories.map(category => renderSection(category))}
      </div>

      <style jsx>{`
        .at-section-title {
          font-family: "Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif;
          font-size: 18px;
          font-weight: 800;
          letter-spacing: 0.01em;
          color: var(--text-primary);
          margin-bottom: 14px;
        }
      `}</style>
      <style jsx global>{`
        .at-card {
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid var(--border-default);
          background: var(--surface-default);
          cursor: pointer;
          transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .at-card:hover {
          transform: translateY(-3px);
          border-color: var(--border-strong);
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
        }
        .at-thumb {
          height: 168px;
          background-size: cover;
          background-position: center;
        }
        .at-label {
          padding: 16px 12px;
          text-align: center;
          font-size: 15px;
          font-weight: 700;
          color: var(--text-primary);
          border-top: 1px solid var(--border-default);
        }
      `}</style>
    </div>
  );
}
