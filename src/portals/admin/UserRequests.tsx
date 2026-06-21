import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";

type UserRequest = {
  _id: string;
  id: string;
  name: string;
  email: string;
  role: string;
  status: "pending" | "approved" | "rejected";
  rejectionReason?: string;
  requestedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
};

export function UserRequests({ onUserApproved }: { onUserApproved?: () => void }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<UserRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<UserRequest | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadRequests();
  }, []);

  async function loadRequests() {
    try {
      const res = await fetch("/api/user-requests");
      if (res.ok) {
        const data = await res.json();
        setRequests(data);
      }
    } catch (error) {
      console.error("Failed to load user requests:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(request: UserRequest) {
    if (!window.confirm(`Approve registration request for ${request.name}?`)) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/user-requests/${request.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", reviewedBy: user?.name || "Admin" })
      });
      if (res.ok) {
        await loadRequests();
        onUserApproved?.();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to approve user");
      }
    } catch (error) {
      console.error("Failed to approve user:", error);
      alert("Failed to approve user");
    } finally {
      setProcessing(false);
    }
  }

  async function handleReject() {
    if (!selectedRequest) return;
    if (!rejectionReason.trim()) {
      alert("Please provide a rejection reason");
      return;
    }
    setProcessing(true);
    try {
      const res = await fetch(`/api/user-requests/${selectedRequest.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          rejectionReason: rejectionReason.trim(),
          reviewedBy: user?.name || "Admin"
        })
      });
      if (res.ok) {
        alert("User request rejected");
        setShowRejectDialog(false);
        setRejectionReason("");
        setSelectedRequest(null);
        loadRequests();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to reject user");
      }
    } catch (error) {
      console.error("Failed to reject user:", error);
      alert("Failed to reject user");
    } finally {
      setProcessing(false);
    }
  }

  const filteredRequests = requests.filter(r => r.status === activeTab);
  const allSelected = filteredRequests.length > 0 && filteredRequests.every(r => selectedIds.has(r.id));

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRequests.map(r => r.id)));
    }
  }

  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected request(s) permanently?`)) return;
    setProcessing(true);
    try {
      const res = await fetch("/api/user-requests", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) })
      });
      if (res.ok) {
        setSelectedIds(new Set());
        loadRequests();
      }
    } catch (error) {
      console.error("Failed to delete requests:", error);
    } finally {
      setProcessing(false);
    }
  }

  function switchTab(tab: "pending" | "approved" | "rejected") {
    setActiveTab(tab);
    setSelectedIds(new Set());
  }

  if (loading) {
    return <div className="panel-empty">Loading requests...</div>;
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-header-row">
          <span>User Registration Requests</span>
        </div>
      </div>

      <div style={{ borderBottom: "1px solid #e5e7eb", padding: "0 24px" }}>
        <div style={{ display: "flex", gap: 24 }}>
          <button
            onClick={() => switchTab("pending")}
            style={{
              padding: "12px 0", fontSize: 14, fontWeight: 500,
              color: activeTab === "pending" ? "#2563eb" : "#6b7280",
              borderBottom: activeTab === "pending" ? "2px solid #2563eb" : "2px solid transparent",
              background: "none", border: "none", cursor: "pointer"
            }}
          >
            Pending ({requests.filter(r => r.status === "pending").length})
          </button>
          <button
            onClick={() => switchTab("approved")}
            style={{
              padding: "12px 0", fontSize: 14, fontWeight: 500,
              color: activeTab === "approved" ? "#2563eb" : "#6b7280",
              borderBottom: activeTab === "approved" ? "2px solid #2563eb" : "2px solid transparent",
              background: "none", border: "none", cursor: "pointer"
            }}
          >
            Approved ({requests.filter(r => r.status === "approved").length})
          </button>
          <button
            onClick={() => switchTab("rejected")}
            style={{
              padding: "12px 0", fontSize: 14, fontWeight: 500,
              color: activeTab === "rejected" ? "#2563eb" : "#6b7280",
              borderBottom: activeTab === "rejected" ? "2px solid #2563eb" : "2px solid transparent",
              background: "none", border: "none", cursor: "pointer"
            }}
          >
            Rejected ({requests.filter(r => r.status === "rejected").length})
          </button>
        </div>
      </div>

      <div className="panel-body">
        {filteredRequests.length === 0 ? (
          <div className="panel-empty">No {activeTab} requests</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Select All + Delete Bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #e5e7eb" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#374151" }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  style={{ width: 16, height: 16, cursor: "pointer" }}
                />
                Select All ({filteredRequests.length})
              </label>
              {selectedIds.size > 0 && (
                <button
                  onClick={handleDeleteSelected}
                  disabled={processing}
                  style={{ padding: "6px 14px", backgroundColor: "#dc2626", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  Delete Selected ({selectedIds.size})
                </button>
              )}
            </div>

            {filteredRequests.map((request) => (
              <div
                key={request.id}
                style={{
                  padding: 16,
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  backgroundColor: selectedIds.has(request.id) ? "#eff6ff" : "#ffffff",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(request.id)}
                  onChange={() => toggleSelect(request.id)}
                  style={{ width: 16, height: 16, cursor: "pointer", marginTop: 2, flexShrink: 0 }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "#111827", marginBottom: 4 }}>
                        {request.name}
                      </div>
                      <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>
                        {request.email}
                      </div>
                      <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#6b7280" }}>
                        <span><strong>Role:</strong> <span style={{ textTransform: "capitalize" }}>{request.role}</span></span>
                        <span><strong>Requested:</strong> {new Date(request.requestedAt).toLocaleDateString()}</span>
                        {request.reviewedAt && (
                          <span><strong>Reviewed:</strong> {new Date(request.reviewedAt).toLocaleDateString()}</span>
                        )}
                        {request.reviewedBy && (
                          <span><strong>By:</strong> {request.reviewedBy}</span>
                        )}
                      </div>
                      {request.status === "rejected" && request.rejectionReason && (
                        <div style={{ marginTop: 8, padding: 8, backgroundColor: "#fef2f2", borderRadius: 4, fontSize: 12, color: "#991b1b" }}>
                          <strong>Rejection Reason:</strong> {request.rejectionReason}
                        </div>
                      )}
                    </div>
                    {request.status === "pending" && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => handleApprove(request)} disabled={processing} className="btn-primary btn-success btn-small">
                          Approve
                        </button>
                        <button
                          onClick={() => { setSelectedRequest(request); setShowRejectDialog(true); }}
                          disabled={processing}
                          className="btn-secondary btn-danger btn-small"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                    {request.status === "approved" && (
                      <span style={{ padding: "4px 12px", backgroundColor: "#dcfce7", color: "#166534", borderRadius: 4, fontSize: 12, fontWeight: 500 }}>
                        Approved
                      </span>
                    )}
                    {request.status === "rejected" && (
                      <span style={{ padding: "4px 12px", backgroundColor: "#fee2e2", color: "#991b1b", borderRadius: 4, fontSize: 12, fontWeight: 500 }}>
                        Rejected
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showRejectDialog && selectedRequest && (
        <div className="overlay">
          <div className="dialog" style={{ width: 500, maxWidth: "90vw" }}>
            <div className="dialog-title">Reject Registration Request</div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 12 }}>
                Rejecting request from <strong>{selectedRequest.name}</strong> ({selectedRequest.email})
              </div>
              <label className="field">
                <span className="field-label">Rejection Reason</span>
                <textarea
                  className="field-input"
                  rows={4}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Provide a reason for rejection..."
                />
              </label>
            </div>
            <div className="dialog-footer">
              <div />
              <div className="dialog-actions">
                <button
                  type="button"
                  className="btn-secondary btn-cancel"
                  onClick={() => { setShowRejectDialog(false); setRejectionReason(""); setSelectedRequest(null); }}
                  disabled={processing}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary btn-danger"
                  onClick={handleReject}
                  disabled={processing || !rejectionReason.trim()}
                >
                  {processing ? "Rejecting..." : "Reject Request"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
