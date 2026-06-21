import { useState } from "react";
import { UserProfile } from "../../types";

export function WebTemplatesPage(props: {
  users: UserProfile[];
  managerId: string;
  onUsersChange: (users: UserProfile[]) => void;
}) {
  // Filter sales reps that belong to this manager and have pending approval
  const salesReps = props.users.filter(
    (user) => 
      user.role === "sales" && 
      user.managerId === props.managerId &&
      user.webPage?.status === "pendingApproval"
  );
  
  const [editingRepId, setEditingRepId] = useState<string | null>(null);
  const editingRep = editingRepId ? props.users.find((u) => u.id === editingRepId) || null : null;

  async function updateStatus(user: UserProfile, status: "draft" | "pendingApproval" | "published" | "rejected") {
    const nextUsers = props.users.map((u) =>
      u.id === user.id ? { ...u, webPage: { ...(u.webPage ?? {}), status } } : u
    );
    props.onUsersChange(nextUsers);
    
    // Show confirmation message
    if (status === "published") {
      alert(`✓ ${user.name}'s web page has been approved and published!`);
    } else if (status === "rejected") {
      alert(`${user.name}'s web page has been rejected.`);
    }
  }

  function updateEditingRep<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    if (!editingRep) return;
    const nextUsers = props.users.map((u) => (u.id === editingRep.id ? { ...u, [key]: value } : u));
    props.onUsersChange(nextUsers);
  }

  function saveAndCloseEditor() {
    setEditingRepId(null);
  }

  function getStatusLabel(status?: string) {
    if (!status || status === "draft") return "Pending";
    if (status === "pendingApproval") return "Pending approval";
    if (status === "published") return "Published";
    if (status === "rejected") return "Rejected";
    return status;
  }

  function getStatusClassName(status?: string) {
    if (!status || status === "draft") return "status-pending";
    if (status === "pendingApproval") return "status-pending";
    if (status === "published") return "status-approved";
    if (status === "rejected") return "status-rejected";
    return "status-pending";
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-header-row">
          <span>Team Web Page Approvals</span>
        </div>
      </div>
      <div className="panel-body">
        {salesReps.length === 0 ? (
          <div className="panel-empty">No pending web page approvals from your team.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 720 }}>
              <thead>
                <tr style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>
                  <th style={{ padding: "8px 12px", textAlign: "left" }}>Rep</th>
                  <th style={{ padding: "8px 12px", textAlign: "left" }}>Web Page URL</th>
                  <th style={{ padding: "8px 12px", textAlign: "center" }}>Status</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {salesReps.map((rep, index) => {
                  const slug = rep.name.toLowerCase().replace(/\s+/g, "");
                  const primaryDomain = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || 'localhost:3000';
                  const url = `http://${slug}.${primaryDomain}`;
                  const status = rep.webPage?.status ?? "draft";
                  const statusClass = getStatusClassName(status);
                  const statusLabel = getStatusLabel(status);
                  return (
                    <tr
                      key={rep.id}
                      style={{
                        borderTop: index === 0 ? "1px solid #e5e7eb" : "none",
                        borderBottom: "1px solid #e5e7eb"
                      }}
                    >
                      <td style={{ padding: "10px 12px", fontSize: 13 }}>
                        <div style={{ fontWeight: 600 }}>{rep.name}</div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>{rep.email}</div>
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12 }}>
                        <a 
                          href={url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ color: '#3b82f6', textDecoration: 'underline' }}
                        >
                          {url}
                        </a>
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                        <span className={`status-badge ${statusClass}`}>{statusLabel}</span>
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>
                        <button 
                          type="button" 
                          className="btn-primary btn-success btn-small" 
                          style={{ marginLeft: 0 }} 
                          onClick={() => updateStatus(rep, "published")}
                        >
                          Approve
                        </button>
                        <button 
                          type="button" 
                          className="btn-secondary btn-danger-solid btn-small" 
                          style={{ marginLeft: 8 }} 
                          onClick={() => updateStatus(rep, "rejected")}
                        >
                          Reject
                        </button>
                        <button 
                          type="button" 
                          className="btn-secondary btn-dark btn-small" 
                          style={{ marginLeft: 8 }} 
                          onClick={() => setEditingRepId(rep.id)}
                        >
                          Edit Template
                        </button>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary btn-dark btn-small"
                          style={{ marginLeft: 8, display: 'inline-block', textDecoration: 'none' }}
                        >
                          Preview
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {editingRep && (
          <div className="panel" style={{ marginTop: 16 }}>
            <div className="panel-header">
              <div className="panel-header-row">
                <span>Edit Web Page Template - {editingRep.name}</span>
                <div style={{ display: "inline-flex", gap: 8 }}>
                  <button className="btn-primary btn-success solid btn-small" type="button" onClick={saveAndCloseEditor}>Save & Close</button>
                  <button className="btn-secondary btn-small" type="button" onClick={() => setEditingRepId(null)}>Cancel</button>
                </div>
              </div>
            </div>
            <div className="panel-body">
              <div className="panel-section">
                <div className="panel-section-title">Contact Information</div>
                <div className="form-grid">
                  <label className="field">
                    <span className="field-label">Name</span>
                    <input 
                      className="field-input" 
                      value={editingRep.name ?? ""} 
                      onChange={(e) => updateEditingRep("name", e.target.value)} 
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Email</span>
                    <input 
                      className="field-input" 
                      value={editingRep.email ?? ""} 
                      onChange={(e) => updateEditingRep("email", e.target.value)} 
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Phone</span>
                    <input 
                      className="field-input" 
                      value={editingRep.phone ?? ""} 
                      onChange={(e) => updateEditingRep("phone", e.target.value)} 
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Headshot URL</span>
                    <input 
                      className="field-input" 
                      value={editingRep.headshotUrl ?? ""} 
                      onChange={(e) => updateEditingRep("headshotUrl", e.target.value)} 
                      placeholder="https://example.com/headshot.jpg"
                    />
                  </label>
                </div>
                <label className="field">
                  <span className="field-label">Bio</span>
                  <textarea 
                    className="field-input" 
                    rows={6} 
                    value={editingRep.bio ?? ""} 
                    onChange={(e) => updateEditingRep("bio", e.target.value)} 
                    placeholder="Enter bio..."
                  />
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
