import type { NextPage } from "next";
import { useEffect, useState } from "react";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { UserManagement } from "../../src/portals/admin/UserManagement";
import { UserRequests } from "../../src/portals/admin/UserRequests";
import { UserProfile } from "../../src/types";

const UserManagementPage: NextPage = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [deletedUsers, setDeletedUsers] = useState<UserProfile[]>([]);
  const [activeTab, setActiveTab] = useState<"users" | "requests" | "deleted">("users");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    async function loadData() {
      try {
        // Load active users
        const res = await fetch("/api/users?deleted=false");
        if (res.ok) setUsers(await res.json());
        
        // Load deleted users
        const deletedRes = await fetch("/api/users?deleted=true");
        if (deletedRes.ok) setDeletedUsers(await deletedRes.json());
      } catch (error) {
        console.error("Failed to load users:", error);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    async function loadPendingCount() {
      try {
        const res = await fetch("/api/user-requests");
        if (res.ok) {
          const requests = await res.json();
          setPendingCount(requests.filter((r: any) => r.status === "pending").length);
        }
      } catch (error) {
        console.error("Failed to load requests:", error);
      }
    }
    loadPendingCount();
    const interval = setInterval(loadPendingCount, 30000);
    return () => clearInterval(interval);
  }, []);

  function handleUsersChange(next: UserProfile[]) {
    setUsers(next);
  }

  async function handleDeletedUsersChange(next: UserProfile[]) {
    setDeletedUsers(next);
    // Reload both lists
    try {
      const [usersRes, deletedRes] = await Promise.all([
        fetch("/api/users?deleted=false"),
        fetch("/api/users?deleted=true")
      ]);
      
      if (usersRes.ok) setUsers(await usersRes.json());
      if (deletedRes.ok) setDeletedUsers(await deletedRes.json());
    } catch (error) {
      console.error("Failed to reload users:", error);
    }
  }

  return (
    <AdminPageWrapper currentView="userManagement">
      <div style={{ marginBottom: 16, borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ display: "flex", gap: 24, paddingLeft: 24 }}>
          <button
            onClick={() => setActiveTab("users")}
            style={{
              padding: "12px 0",
              fontSize: 15,
              fontWeight: 500,
              color: activeTab === "users" ? "#2563eb" : "#6b7280",
              borderBottom: activeTab === "users" ? "2px solid #2563eb" : "2px solid transparent",
              background: "none",
              border: "none",
              cursor: "pointer"
            }}
          >
            User Management
          </button>
          <button
            onClick={() => setActiveTab("requests")}
            style={{
              padding: "12px 0",
              fontSize: 15,
              fontWeight: 500,
              color: activeTab === "requests" ? "#2563eb" : "#6b7280",
              borderBottom: activeTab === "requests" ? "2px solid #2563eb" : "2px solid transparent",
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6
            }}
          >
            User Requests
            {pendingCount > 0 && (
              <span style={{
                backgroundColor: "#dc2626",
                color: "#ffffff",
                fontSize: 12,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 12,
                minWidth: 20,
                textAlign: "center"
              }}>
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("deleted")}
            style={{
              padding: "12px 0",
              fontSize: 15,
              fontWeight: 500,
              color: activeTab === "deleted" ? "#2563eb" : "#6b7280",
              borderBottom: activeTab === "deleted" ? "2px solid #2563eb" : "2px solid transparent",
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6
            }}
          >
            🗑️ Deleted Users
            {deletedUsers.length > 0 && (
              <span style={{
                backgroundColor: "#ef4444",
                color: "#ffffff",
                fontSize: 12,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 12,
                minWidth: 20,
                textAlign: "center"
              }}>
                {deletedUsers.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {activeTab === "users" ? (
        <UserManagement
          users={users}
          deletedUsers={[]}
          onUsersChange={handleUsersChange}
          onDeletedUsersChange={() => {}}
        />
      ) : activeTab === "deleted" ? (
        <div className="panel">
          <div className="panel-header">Deleted Users</div>
          <div className="panel-body">
            {deletedUsers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🗑️</div>
                <div style={{ fontSize: 16, fontWeight: 500 }}>No deleted users</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {deletedUsers.map((user) => (
                  <div key={user.id} style={{ 
                    padding: 16, 
                    backgroundColor: '#fef2f2', 
                    borderLeft: '3px solid #ef4444',
                    borderRadius: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{user.name}</div>
                      <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 4 }}>
                        {(user.roles || [user.role]).map(r => r.toUpperCase()).join(", ")} • {user.email}
                      </div>
                      {user.deletedAt && (
                        <div style={{ fontSize: 12, color: '#9ca3af' }}>
                          Deleted: {new Date(user.deletedAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="btn-secondary btn-success"
                        onClick={async () => {
                          if (confirm(`Restore ${user.name}? They will be able to log in again.`)) {
                            try {
                              await fetch(`/api/users/${user.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'restore' })
                              });
                              const [usersRes, deletedRes] = await Promise.all([
                                fetch("/api/users?deleted=false"),
                                fetch("/api/users?deleted=true")
                              ]);
                              if (usersRes.ok) setUsers(await usersRes.json());
                              if (deletedRes.ok) setDeletedUsers(await deletedRes.json());
                              alert(`${user.name} has been restored successfully!`);
                            } catch (error) {
                              console.error('Failed to restore user:', error);
                              alert('Failed to restore user');
                            }
                          }
                        }}
                      >
                        Restore User
                      </button>
                      <button
                        type="button"
                        style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                        onClick={async () => {
                          if (confirm(`⚠️ PERMANENTLY DELETE ${user.name}?\n\nThis CANNOT be undone. All data will be lost forever.`)) {
                            try {
                              await fetch(`/api/users/${user.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'permanent-delete' })
                              });
                              const [usersRes, deletedRes] = await Promise.all([
                                fetch("/api/users?deleted=false"),
                                fetch("/api/users?deleted=true")
                              ]);
                              if (usersRes.ok) setUsers(await usersRes.json());
                              if (deletedRes.ok) setDeletedUsers(await deletedRes.json());
                            } catch (error) {
                              console.error('Failed to permanently delete user:', error);
                              alert('Failed to permanently delete user');
                            }
                          }
                        }}
                      >
                        Delete Permanently
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <UserRequests onUserApproved={async () => {
          const [usersRes, deletedRes] = await Promise.all([
            fetch("/api/users?deleted=false"),
            fetch("/api/users?deleted=true")
          ]);
          if (usersRes.ok) setUsers(await usersRes.json());
          if (deletedRes.ok) setDeletedUsers(await deletedRes.json());
        }} />
      )}
    </AdminPageWrapper>
  );
};

export default UserManagementPage;
