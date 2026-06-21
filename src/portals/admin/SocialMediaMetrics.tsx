import { useState, useEffect } from "react";
import { SocialMediaCharts } from "../../components/SocialMediaCharts";

type SocialMetric = {
  _id?: string;
  id: string;
  platform: string;
  platformName: string;
  followers: number;
  posts30d: number;
  views30d: number;
  lastUpdated?: string;
  [key: string]: any; // Allow custom columns
};

type CustomColumn = {
  id: string;
  name: string;
  datatype: "string" | "number" | "boolean" | "date";
  isDefault?: boolean; // Track if it's a default column
};

const platformOptions = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" }
];

const datatypeOptions = [
  { value: "string", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Yes/No" },
  { value: "date", label: "Date" }
];

// Default columns that can be toggled
const DEFAULT_COLUMNS: CustomColumn[] = [
  { id: "col-followers", name: "Followers", datatype: "number", isDefault: true },
  { id: "col-posts30d", name: "Posts (30d)", datatype: "number", isDefault: true },
  { id: "col-views30d", name: "Views (30d)", datatype: "number", isDefault: true }
];

export function SocialMediaMetrics() {
  const [metrics, setMetrics] = useState<SocialMetric[]>([]);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [columnName, setColumnName] = useState("");
  const [activeTab, setActiveTab] = useState<'dashboard' | 'configuration'>('dashboard');
  const [selectedPlatform, setSelectedPlatform] = useState<string>("");
  const [showChart, setShowChart] = useState(false);
  const [showSocialDetails, setShowSocialDetails] = useState(true);
  const [columnDatatype, setColumnDatatype] = useState<"string" | "number" | "boolean" | "date">("string");
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [showColumnEditModal, setShowColumnEditModal] = useState(false);
  const [editColumnName, setEditColumnName] = useState("");
  const [editColumnDatatype, setEditColumnDatatype] = useState<"string" | "number" | "boolean" | "date">("string");
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);

  // Get all visible columns (all custom columns including defaults)
  const allVisibleColumns = customColumns;

  useEffect(() => {
    loadMetrics();
    loadCustomColumns();
  }, []);

  async function loadCustomColumns() {
    try {
      const res = await fetch("/api/social-media-metrics/columns");
      if (res.ok) {
        let data = await res.json();
        
        // Apply saved column order from localStorage
        const savedOrder = localStorage.getItem('social-metrics-column-order');
        if (savedOrder) {
          try {
            const orderIds = JSON.parse(savedOrder);
            const orderedColumns = [];
            
            // Add columns in saved order
            for (const id of orderIds) {
              const col = data.find((c: CustomColumn) => c.id === id);
              if (col) orderedColumns.push(col);
            }
            
            // Add any new columns that weren't in saved order
            for (const col of data) {
              if (!orderedColumns.find(c => c.id === col.id)) {
                orderedColumns.push(col);
              }
            }
            
            data = orderedColumns;
          } catch (e) {
            console.error("Failed to apply saved column order:", e);
          }
        }
        
        setCustomColumns(data);
      }
    } catch (error) {
      console.error("Failed to load custom columns:", error);
    }
  }

  async function addCustomColumn() {
    if (!columnName.trim()) {
      alert("Please enter a column name");
      return;
    }

    try {
      console.log("=== ADDING CUSTOM COLUMN ===");
      console.log("Column name:", columnName);
      console.log("Column datatype:", columnDatatype);

      const requestBody = {
        name: columnName,
        datatype: columnDatatype
      };
      console.log("Request body:", JSON.stringify(requestBody));

      const res = await fetch("/api/social-media-metrics/columns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      console.log("API Response status:", res.status);
      console.log("API Response headers:", res.headers);
      
      const responseText = await res.text();
      console.log("API Response text:", responseText);
      
      let newColumn;
      try {
        newColumn = JSON.parse(responseText);
      } catch (e) {
        console.error("Failed to parse response:", e);
        alert("Failed to parse API response");
        return;
      }

      console.log("Parsed response:", newColumn);

      if (res.ok) {
        console.log("✓ Column created successfully");
        setCustomColumns([...customColumns, newColumn]);
        
        // Add default values to all metrics in local state
        let defaultValue: any;
        switch (columnDatatype) {
          case "number":
            defaultValue = 0;
            break;
          case "boolean":
            defaultValue = false;
            break;
          case "date":
            defaultValue = new Date().toISOString().split('T')[0];
            break;
          case "string":
          default:
            defaultValue = "";
            break;
        }

        console.log("Adding default value to all metrics:", defaultValue);
        setMetrics(metrics.map(m => ({
          ...m,
          [columnName]: defaultValue
        })));

        setColumnName("");
        setColumnDatatype("string");
        setShowColumnModal(false);
        alert("✓ Column added successfully! Default values populated for all rows.");
      } else {
        console.log("✗ Failed to add column. Status:", res.status);
        console.log("Error response:", newColumn);
        alert(`Failed to add column: ${newColumn.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to add column:", error);
      alert(`Failed to add column: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async function deleteCustomColumn(columnId: string) {
    if (!window.confirm("Are you sure you want to delete this column? This will remove the data from all rows.")) {
      return;
    }

    try {
      const res = await fetch(`/api/social-media-metrics/columns/${columnId}`, {
        method: "DELETE"
      });

      if (res.ok) {
        // Remove column from state
        setCustomColumns(customColumns.filter(c => c.id !== columnId));
        
        // Remove column data from all metrics
        const columnToDelete = customColumns.find(c => c.id === columnId);
        if (columnToDelete) {
          setMetrics(metrics.map(m => {
            const updated = { ...m };
            delete updated[columnToDelete.name];
            return updated;
          }));
        }
        
        alert("✓ Column deleted successfully!");
      } else {
        alert("Failed to delete column");
      }
    } catch (error) {
      console.error("Failed to delete column:", error);
      alert("Failed to delete column");
    }
  }

  function openColumnEditModal(column: CustomColumn) {
    setEditingColumnId(column.id);
    setEditColumnName(column.name);
    setEditColumnDatatype(column.datatype);
    setShowColumnEditModal(true);
  }

  async function saveColumnEdit() {
    if (!editColumnName.trim()) {
      alert("Please enter a column name");
      return;
    }

    try {
      // For now, we'll just update the local state
      // In a real app, you'd want to update the database too
      setCustomColumns(customColumns.map(col => 
        col.id === editingColumnId 
          ? { ...col, name: editColumnName, datatype: editColumnDatatype }
          : col
      ));

      // Update metrics with new column name if it changed
      const oldColumn = customColumns.find(c => c.id === editingColumnId);
      if (oldColumn && oldColumn.name !== editColumnName) {
        setMetrics(metrics.map(m => {
          const updated = { ...m };
          if (oldColumn.name in updated) {
            updated[editColumnName] = updated[oldColumn.name];
            delete updated[oldColumn.name];
          }
          return updated;
        }));
      }

      setShowColumnEditModal(false);
      setEditingColumnId(null);
      setEditColumnName("");
      setEditColumnDatatype("string");
      alert("✓ Column updated successfully!");
    } catch (error) {
      console.error("Failed to update column:", error);
      alert("Failed to update column");
    }
  }

  // Row drag and drop handlers
  function handleRowDragStart(e: React.DragEvent, metricId: string) {
    setDraggedRowId(metricId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleRowDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleRowDrop(e: React.DragEvent, targetMetricId: string) {
    e.preventDefault();
    if (!draggedRowId || draggedRowId === targetMetricId) return;

    const draggedIndex = metrics.findIndex(m => m.id === draggedRowId);
    const targetIndex = metrics.findIndex(m => m.id === targetMetricId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newMetrics = [...metrics];
    const [draggedMetric] = newMetrics.splice(draggedIndex, 1);
    newMetrics.splice(targetIndex, 0, draggedMetric);

    setMetrics(newMetrics);
    setDraggedRowId(null);
  }

  // Column drag and drop handlers
  function handleColumnDragStart(e: React.DragEvent, columnId: string) {
    setDraggedColumnId(columnId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleColumnDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleColumnDrop(e: React.DragEvent, targetColumnId: string) {
    e.preventDefault();
    if (!draggedColumnId || draggedColumnId === targetColumnId) return;

    const draggedIndex = customColumns.findIndex(c => c.id === draggedColumnId);
    const targetIndex = customColumns.findIndex(c => c.id === targetColumnId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newColumns = [...customColumns];
    const [draggedColumn] = newColumns.splice(draggedIndex, 1);
    newColumns.splice(targetIndex, 0, draggedColumn);

    setCustomColumns(newColumns);
    setDraggedColumnId(null);
  }

  async function loadMetrics() {
    setLoading(true);
    try {
      console.log("Loading metrics...");
      const res = await fetch("/api/social-media-metrics");
      if (res.ok) {
        const data = await res.json();
        console.log("Loaded metrics count:", data.length);
        if (data.length > 0) {
          console.log("First metric keys:", Object.keys(data[0]));
          console.log("First metric data:", JSON.stringify(data[0], null, 2));
        }
        setMetrics(data);
        // Set default selected platform to first metric
        if (data.length > 0 && !selectedPlatform) {
          setSelectedPlatform(data[0].platform);
        }
      } else {
        console.error("Failed to load metrics:", await res.text());
      }
    } catch (error) {
      console.error("Failed to load metrics:", error);
    } finally {
      setLoading(false);
    }
  }

  function addNewMetric() {
    const newMetric: SocialMetric = {
      id: `social-new-${Date.now()}`,
      platform: "instagram",
      platformName: "Instagram",
      followers: 0,
      posts30d: 0,
      views30d: 0
    };
    setMetrics([...metrics, newMetric]);
    setEditingId(newMetric.id);
  }

  function updateMetric(id: string, field: keyof SocialMetric, value: any) {
    setMetrics(metrics.map(m => {
      if (m.id === id) {
        const updated = { ...m, [field]: value };
        // Auto-update platformName when platform changes
        if (field === "platform") {
          const option = platformOptions.find(opt => opt.value === value);
          if (option) {
            updated.platformName = option.label;
          }
        }
        return updated;
      }
      return m;
    }));
  }

  // Helper function to get column value from metric
  function getColumnValue(metric: SocialMetric, columnName: string): any {
    return metric[columnName] ?? "N/A";
  }

  // Helper function to calculate column totals
  function getColumnTotal(columnName: string): number {
    return metrics.reduce((sum, metric) => {
      const value = metric[columnName];
      const num = parseFloat(value);
      return sum + (isNaN(num) ? 0 : num);
    }, 0);
  }

  async function deleteMetric(id: string) {
    if (!window.confirm("Are you sure you want to delete this metric?")) {
      return;
    }

    try {
      // If it's a new unsaved metric, just remove from state
      if (id.startsWith("social-new-")) {
        setMetrics(metrics.filter(m => m.id !== id));
        return;
      }

      const res = await fetch(`/api/social-media-metrics/${id}`, {
        method: "DELETE"
      });

      if (res.ok) {
        setMetrics(metrics.filter(m => m.id !== id));
        alert("Metric deleted successfully");
      } else {
        alert("Failed to delete metric");
      }
    } catch (error) {
      console.error("Failed to delete metric:", error);
      alert("Failed to delete metric");
    }
  }

  async function saveMetrics() {
    setSaving(true);
    try {
      console.log("=== FRONTEND: Saving metrics ===");
      console.log("Metrics to save count:", metrics.length);
      console.log("First metric keys:", metrics.length > 0 ? Object.keys(metrics[0]) : "no metrics");
      console.log("First metric data:", metrics.length > 0 ? JSON.stringify(metrics[0], null, 2) : "no metrics");
      
      const res = await fetch("/api/social-media-metrics", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metrics)
      });

      const data = await res.json();
      console.log("=== FRONTEND: Save response ===");
      console.log("Status:", res.status);
      console.log("Response:", data);

      if (res.ok && data.success) {
        // Save column order to localStorage
        localStorage.setItem('social-metrics-column-order', JSON.stringify(customColumns.map(c => c.id)));
        
        alert("✓ Metrics saved successfully!");
        setEditingId(null);
        
        console.log("=== FRONTEND: Reloading metrics ===");
        // Reload to get updated data from database
        await loadMetrics();
        console.log("=== FRONTEND: Reload complete ===");
      } else {
        console.error("Save failed:", data);
        alert(`❌ Failed to save metrics: ${data.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to save metrics:", error);
      alert(`❌ Failed to save metrics. Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }

  const totalFollowers = metrics.reduce((sum, m) => sum + (m.followers || 0), 0);
  const totalPosts = metrics.reduce((sum, m) => sum + (m.posts30d || 0), 0);
  const totalViews = metrics.reduce((sum, m) => sum + (m.views30d || 0), 0);

  if (loading) {
    return <div className="panel-empty">Loading metrics...</div>;
  }

  // Render Dashboard View
  function renderDashboardView() {
    const socialPlatforms = metrics;
    
    return (
      <>
        {socialPlatforms.length === 0 ? (
          <div className="panel-empty">
            No social media metrics configured yet. Switch to the Configuration tab to add metrics.
          </div>
        ) : (
          <>
            <div className="grid grid-3" style={{ marginBottom: 16 }}>
              {customColumns.map(col => {
                if (col.datatype === "number") {
                  const total = metrics.reduce((sum, m) => {
                    const value = m[col.name];
                    const num = parseFloat(value);
                    return sum + (isNaN(num) ? 0 : num);
                  }, 0);
                  return (
                    <div key={col.id} style={{ padding: 16, backgroundColor: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Total {col.name}</div>
                      <div style={{ fontSize: 24, fontWeight: 600, color: "#111827" }}>{total.toLocaleString()}</div>
                    </div>
                  );
                }
                return null;
              })}
            </div>

            {showSocialDetails && (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `1fr ${customColumns.map(() => "1fr").join(" ")}`,
                    gap: 12,
                    fontSize: 12,
                    fontWeight: 600,
                    marginBottom: 8,
                    padding: "12px 16px",
                    borderBottom: "2px solid #e5e7eb",
                    color: "#374151",
                    backgroundColor: "#f9fafb"
                  }}
                >
                  <div>Platform</div>
                  {customColumns.map(col => (
                    <div key={col.id} style={{ textAlign: "center" }}>{col.name}</div>
                  ))}
                </div>

                {metrics.map((metric, index) => (
                  <div
                    key={metric.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: `1fr ${customColumns.map(() => "1fr").join(" ")}`,
                      gap: 12,
                      alignItems: "center",
                      padding: "12px 16px",
                      borderBottom: "1px solid #f1f5f9",
                      backgroundColor: index % 2 === 0 ? "#ffffff" : "#f9fafb",
                      fontSize: 14
                    }}
                  >
                    <div style={{ fontWeight: 500 }}>{metric.platformName}</div>
                    {customColumns.map(col => (
                      <div key={col.id} style={{ textAlign: "center", fontWeight: 500 }}>
                        {col.datatype === "number" ? (metric[col.name] || 0).toLocaleString() : metric[col.name] || "-"}
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
            
            <div style={{ marginTop: 24 }}>
              <SocialMediaCharts platforms={metrics} customColumns={customColumns} />
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-header-row">
          <span>Social Media Metrics Management</span>
          <div style={{ display: "flex", gap: 8 }}>
            {activeTab === 'configuration' && (
              <>
                <button
                  type="button"
                  className="btn-primary btn-success btn-small"
                  onClick={addNewMetric}
                >
                  + Add Platform
                </button>
                <button
                  type="button"
                  className="btn-primary btn-small"
                  onClick={() => setShowColumnModal(true)}
                >
                  + Add Column
                </button>
                <button
                  type="button"
                  className="btn-primary btn-small"
                  onClick={saveMetrics}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save All Changes"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ 
        display: 'flex', 
        gap: '0', 
        borderBottom: '2px solid #e5e7eb',
        padding: '0 24px',
        backgroundColor: '#fff'
      }}>
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          style={{
            padding: '12px 24px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: activeTab === 'dashboard' ? '600' : '400',
            color: activeTab === 'dashboard' ? '#3b82f6' : '#6b7280',
            borderBottom: activeTab === 'dashboard' ? '2px solid #3b82f6' : '2px solid transparent',
            marginBottom: '-2px',
            transition: 'all 0.2s'
          }}
        >
          Dashboard
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('configuration')}
          style={{
            padding: '12px 24px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: activeTab === 'configuration' ? '600' : '400',
            color: activeTab === 'configuration' ? '#3b82f6' : '#6b7280',
            borderBottom: activeTab === 'configuration' ? '2px solid #3b82f6' : '2px solid transparent',
            marginBottom: '-2px',
            transition: 'all 0.2s'
          }}
        >
          Configuration
        </button>
      </div>

      <div className="panel-body">
        {activeTab === 'dashboard' ? (
          /* Dashboard Tab Content */
          <div>
            <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: '600' }}>Social Media Dashboard</h3>
            {/* Dashboard content will go here - for now showing the existing dashboard view */}
            {renderDashboardView()}
          </div>
        ) : (
          /* Configuration Tab Content */
          <>
            {/* Add Column Modal */}
            {showColumnModal && (
              <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999
          }} onClick={() => {
            setShowColumnModal(false);
            setColumnName("");
            setColumnDatatype("string");
          }}>
            <div style={{
              backgroundColor: "white",
              borderRadius: 8,
              padding: 24,
              maxWidth: 450,
              width: "95%",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
              border: "1px solid #e5e7eb"
            }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#111827" }}>Add Custom Column</h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowColumnModal(false);
                    setColumnName("");
                    setColumnDatatype("string");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: 24,
                    cursor: "pointer",
                    color: "#6b7280",
                    padding: 0,
                    width: 32,
                    height: 32,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  ✕
                </button>
              </div>
              
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 600, color: "#374151" }}>Column Name</label>
                <input
                  type="text"
                  className="field-input"
                  value={columnName}
                  onChange={(e) => setColumnName(e.target.value)}
                  placeholder="e.g., Engagement Rate, Budget"
                  style={{ width: "100%", padding: "8px 12px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 6 }}
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 600, color: "#374151" }}>Data Type</label>
                <select
                  className="field-input"
                  value={columnDatatype}
                  onChange={(e) => setColumnDatatype(e.target.value as any)}
                  style={{ width: "100%", padding: "8px 12px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 6 }}
                >
                  {datatypeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  onClick={() => {
                    setShowColumnModal(false);
                    setColumnName("");
                    setColumnDatatype("string");
                  }}
                  style={{ padding: "8px 16px", fontSize: 13 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary btn-small"
                  onClick={addCustomColumn}
                  style={{ padding: "8px 16px", fontSize: 13 }}
                >
                  Add Column
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Column Modal */}
        {showColumnEditModal && (
          <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999
          }} onClick={() => {
            setShowColumnEditModal(false);
            setEditingColumnId(null);
            setEditColumnName("");
            setEditColumnDatatype("string");
          }}>
            <div style={{
              backgroundColor: "white",
              borderRadius: 8,
              padding: 24,
              maxWidth: 450,
              width: "95%",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
              border: "1px solid #e5e7eb"
            }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#111827" }}>Edit Column</h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowColumnEditModal(false);
                    setEditingColumnId(null);
                    setEditColumnName("");
                    setEditColumnDatatype("string");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: 24,
                    cursor: "pointer",
                    color: "#6b7280",
                    padding: 0,
                    width: 32,
                    height: 32,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  ✕
                </button>
              </div>
              
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 600, color: "#374151" }}>Column Name</label>
                <input
                  type="text"
                  className="field-input"
                  value={editColumnName}
                  onChange={(e) => setEditColumnName(e.target.value)}
                  placeholder="e.g., Engagement Rate, Budget"
                  style={{ width: "100%", padding: "8px 12px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 6 }}
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 600, color: "#374151" }}>Data Type</label>
                <select
                  className="field-input"
                  value={editColumnDatatype}
                  onChange={(e) => setEditColumnDatatype(e.target.value as any)}
                  style={{ width: "100%", padding: "8px 12px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 6 }}
                >
                  {datatypeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn-ghost btn-danger btn-small"
                  onClick={() => {
                    if (editingColumnId) {
                      deleteCustomColumn(editingColumnId);
                      setShowColumnEditModal(false);
                      setEditingColumnId(null);
                      setEditColumnName("");
                      setEditColumnDatatype("string");
                    }
                  }}
                  style={{ padding: "8px 16px", fontSize: 13, marginRight: "auto" }}
                >
                  Delete Column
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  onClick={() => {
                    setShowColumnEditModal(false);
                    setEditingColumnId(null);
                    setEditColumnName("");
                    setEditColumnDatatype("string");
                  }}
                  style={{ padding: "8px 16px", fontSize: 13 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary btn-small"
                  onClick={saveColumnEdit}
                  style={{ padding: "8px 16px", fontSize: 13 }}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, allVisibleColumns.length)}, 1fr)`, gap: 16, marginBottom: 24 }}>
          {allVisibleColumns.length === 0 ? (
            <div style={{ padding: 16, backgroundColor: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb", gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>No columns added yet</div>
              <div style={{ fontSize: 14, color: "#111827" }}>Click "+ Add Column" to create your first column</div>
            </div>
          ) : (
            allVisibleColumns.map(col => {
              const total = col.datatype === "number" ? getColumnTotal(col.name) : null;
              return (
                <div key={col.id} style={{ padding: 16, backgroundColor: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                  <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Total {col.name}</div>
                  <div style={{ fontSize: 24, fontWeight: 600, color: "#111827" }}>
                    {col.datatype === "number" ? total?.toLocaleString() : "—"}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Metrics Table */}
        {metrics.length === 0 ? (
          <div className="panel-empty">No social media metrics yet. Click "+ Add Platform" to create one.</div>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 24 }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e5e7eb", backgroundColor: "#f9fafb" }}>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "#374151" }}>Platform</th>
                  {allVisibleColumns.map(col => (
                    <th 
                      key={col.id} 
                      draggable
                      onDragStart={(e) => handleColumnDragStart(e, col.id)}
                      onDragOver={handleColumnDragOver}
                      onDrop={(e) => handleColumnDrop(e, col.id)}
                      style={{ 
                        padding: "12px 16px", 
                        textAlign: "center", 
                        fontWeight: 600, 
                        color: "#374151", 
                        backgroundColor: draggedColumnId === col.id ? "#fef3c7" : "#f3f4f6",
                        minWidth: 150,
                        cursor: "move",
                        transition: "background-color 0.2s",
                        opacity: draggedColumnId === col.id ? 0.7 : 1
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <span>☰ {col.name}</span>
                        <button
                          type="button"
                          onClick={() => openColumnEditModal(col)}
                          title={`Edit ${col.name}`}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontSize: 14,
                            padding: "2px 4px",
                            color: "#6b7280",
                            borderRadius: 3,
                            transition: "all 0.2s",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#e5e7eb";
                            (e.currentTarget as HTMLButtonElement).style.color = "#374151";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
                            (e.currentTarget as HTMLButtonElement).style.color = "#6b7280";
                          }}
                        >
                          ⚙️
                        </button>
                      </div>
                    </th>
                  ))}
                  <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, color: "#374151" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((metric, index) => {
                  const isEditing = editingId === metric.id;
                  return (
                    <tr 
                      key={metric.id} 
                      draggable
                      onDragStart={(e) => handleRowDragStart(e, metric.id)}
                      onDragOver={handleRowDragOver}
                      onDrop={(e) => handleRowDrop(e, metric.id)}
                      style={{ 
                        borderBottom: "1px solid #f1f5f9", 
                        backgroundColor: draggedRowId === metric.id ? "#fef3c7" : isEditing ? "#fef3c7" : index % 2 === 0 ? "#ffffff" : "#f9fafb",
                        cursor: "move",
                        transition: "background-color 0.2s",
                        opacity: draggedRowId === metric.id ? 0.7 : 1
                      }}
                    >
                      <td style={{ padding: "12px 16px" }}>
                        {isEditing ? (
                          <input
                            type="text"
                            className="field-input"
                            value={metric.platformName}
                            onChange={(e) => updateMetric(metric.id, "platformName", e.target.value)}
                            placeholder="e.g., Instagram, Facebook"
                            style={{ width: "100%", maxWidth: 200, padding: "6px 8px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 4 }}
                          />
                        ) : (
                          <span style={{ fontWeight: 500, color: "#111827" }}>{metric.platformName}</span>
                        )}
                      </td>
                      {allVisibleColumns.map(col => (
                        <td key={col.id} style={{ padding: "12px 16px", textAlign: "center", backgroundColor: isEditing ? "rgba(243, 244, 246, 0.5)" : "transparent", minWidth: 150 }}>
                          {isEditing ? (
                            col.datatype === "boolean" ? (
                              <select
                                className="field-input"
                                value={metric[col.name] ? "true" : "false"}
                                onChange={(e) => updateMetric(metric.id, col.name as keyof SocialMetric, e.target.value === "true")}
                                style={{ width: "100%", maxWidth: 130, padding: "6px 8px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 4 }}
                              >
                                <option value="false">No</option>
                                <option value="true">Yes</option>
                              </select>
                            ) : col.datatype === "date" ? (
                              <input
                                type="date"
                                className="field-input"
                                value={metric[col.name] || ""}
                                onChange={(e) => updateMetric(metric.id, col.name as keyof SocialMetric, e.target.value)}
                                style={{ width: "100%", maxWidth: 130, padding: "6px 8px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 4 }}
                              />
                            ) : col.datatype === "number" ? (
                              <input
                                type="number"
                                className="field-input"
                                value={metric[col.name] || 0}
                                onChange={(e) => updateMetric(metric.id, col.name as keyof SocialMetric, parseInt(e.target.value) || 0)}
                                style={{ width: "100%", maxWidth: 130, textAlign: "center", padding: "6px 8px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 4 }}
                              />
                            ) : (
                              <input
                                type="text"
                                className="field-input"
                                value={metric[col.name] || ""}
                                onChange={(e) => updateMetric(metric.id, col.name as keyof SocialMetric, e.target.value)}
                                style={{ width: "100%", maxWidth: 130, padding: "6px 8px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 4 }}
                              />
                            )
                          ) : (
                            <span style={{ color: "#374151" }}>
                              {col.datatype === "boolean" ? (metric[col.name] ? "Yes" : "No") : col.datatype === "number" ? (metric[col.name] || 0).toLocaleString() : metric[col.name] || "-"}
                            </span>
                          )}
                        </td>
                      ))}
                      <td style={{ padding: "12px 16px", textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                          {isEditing ? (
                            <button
                              type="button"
                              className="btn-secondary btn-small"
                              onClick={() => setEditingId(null)}
                              style={{ padding: "6px 12px", fontSize: 12, cursor: "pointer" }}
                            >
                              Done
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-secondary btn-small"
                              onClick={() => setEditingId(metric.id)}
                              style={{ padding: "6px 12px", fontSize: 12, cursor: "pointer" }}
                            >
                              Edit
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-ghost btn-danger btn-small"
                            onClick={() => deleteMetric(metric.id)}
                            style={{ padding: "6px 12px", fontSize: 12, cursor: "pointer" }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {metrics.length > 0 && (
          <div style={{ marginTop: 16, padding: 12, backgroundColor: "#eff6ff", borderRadius: 6, fontSize: 12, color: "#1e40af" }}>
            💡 Tip: Click "Edit" to modify values, then click "Save All Changes" to update the database. These metrics will appear on the Admin Dashboard.
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
