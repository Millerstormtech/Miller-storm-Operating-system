import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";

const WebText: NextPage = () => {
  return (
    <AdminPageWrapper currentView="webText">
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        textAlign: 'center'
      }}>
        <h1 style={{ fontSize: '48px', marginBottom: '16px', color: '#6b7280' }}>🚧</h1>
        <h2 style={{ fontSize: '32px', fontWeight: '600', marginBottom: '8px' }}>Coming Soon</h2>
        <p style={{ fontSize: '16px', color: '#6b7280' }}>This feature is under development</p>
      </div>
    </AdminPageWrapper>
  );
};

{/*
import type { NextPage } from "next";
import { useState, useEffect } from "react";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";

type WebTextItem = {
  _id?: string;
  title: string;
  description: string;
  isNew?: boolean;
};

const WebText: NextPage = () => {
  const [items, setItems] = useState<WebTextItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchItems();
  }, []);

  async function fetchItems() {
    try {
      const res = await fetch("/api/web-text");
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch (error) {
      console.error("Failed to fetch web text items:", error);
    }
  }

  function addNewField() {
    setItems([...items, { title: "", description: "", isNew: true }]);
  }

  function updateItem(index: number, field: "title" | "description", value: string) {
    const updated = [...items];
    updated[index][field] = value;
    setItems(updated);
  }

  function removeItem(index: number) {
    const updated = items.filter((_, i) => i !== index);
    setItems(updated);
  }

  async function handleSaveAll() {
    const hasEmpty = items.some(item => !item.title.trim() || !item.description.trim());
    if (hasEmpty) {
      alert("Please fill in all title and description fields");
      return;
    }

    setLoading(true);
    try {
      const newItems = items.filter(item => item.isNew);
      for (const item of newItems) {
        await fetch("/api/web-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: item.title, description: item.description })
        });
      }

      alert("All changes saved successfully!");
      fetchItems();
    } catch (error) {
      console.error("Failed to save items:", error);
      alert("Failed to save changes");
    }
    setLoading(false);
  }

  return (
    <AdminPageWrapper currentView="webText">
      <div className="panel">
        <div className="panel-header">
          <div className="panel-header-row">
            <span>Web Text Management</span>
            <button onClick={addNewField} className="btn-primary btn-success btn-small">
              + Add
            </button>
          </div>
        </div>
        <div className="panel-body">
          {items.length === 0 ? (
            <div className="panel-empty">No text items yet. Click "+ Add" to create one.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {items.map((item, index) => (
                <div
                  key={item._id || `new-${index}`}
                  style={{
                    padding: 16,
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    backgroundColor: "#ffffff"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#6b7280" }}>Item {index + 1}</span>
                    <button
                      onClick={() => removeItem(index)}
                      className="btn-ghost btn-danger btn-small"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="form-grid">
                    <label className="field">
                      <span className="field-label">Title</span>
                      <input
                        className="field-input"
                        type="text"
                        value={item.title}
                        onChange={(e) => updateItem(index, "title", e.target.value)}
                        placeholder="Enter title"
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">Description</span>
                      <textarea
                        className="field-input"
                        value={item.description}
                        onChange={(e) => updateItem(index, "description", e.target.value)}
                        placeholder="Enter description"
                        rows={3}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
          {items.length > 0 && (
            <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={handleSaveAll}
                disabled={loading}
                className="btn-primary btn-success"
              >
                {loading ? "Saving..." : "Save All"}
              </button>
            </div>
          )}
        </div>
      </div>
    </AdminPageWrapper>
  );
};
*/}

export default WebText;
