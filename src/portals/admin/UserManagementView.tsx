import { appConfirm } from "../../lib/appDialogs";
import { useEffect, useState } from "react";
import { UserManagement } from "./UserManagement";
import { UserRequests } from "./UserRequests";
import { UserProfile } from "../../types";
import { useAuth } from "../../contexts/AuthContext";

// The full User Management experience (users / requests / deleted tabs).
// Rendered inside any panel's layout — Admin, C-Level and Branch Manager all
// share this so those roles get the exact same management screen.
export function UserManagementView() {
  const { user: currentUser } = useAuth();
  // Permanently deleting a user is irreversible, so it's admin-only. C-Level and
  // Branch Manager share this screen but can only restore, not purge.
  const isAdmin = currentUser?.role === "admin";
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [deletedUsers, setDeletedUsers] = useState<UserProfile[]>([]);
  const [activeTab, setActiveTab] = useState<"users" | "requests" | "deleted">("users");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/users?deleted=false");
        if (res.ok) setUsers(await res.json());
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

  async function reloadUsers() {
    try {
      const [usersRes, deletedRes] = await Promise.all([
        fetch("/api/users?deleted=false"),
        fetch("/api/users?deleted=true"),
      ]);
      if (usersRes.ok) setUsers(await usersRes.json());
      if (deletedRes.ok) setDeletedUsers(await deletedRes.json());
    } catch (error) {
      console.error("Failed to reload users:", error);
    }
  }

  return (
    <>
      <div style={{ margin: "0 0 20px 24px" }}>
        <div className="um-tabs">
          {([
            { id: "users", label: "User Management", badge: 0, badgeBg: "" },
            { id: "requests", label: "User Requests", badge: pendingCount, badgeBg: "#e01418" },
            { id: "deleted", label: "🗑️ Deleted Users", badge: deletedUsers.length, badgeBg: "#7a7f87" },
          ] as const).map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as typeof activeTab)}
                className={`um-tab${active ? " um-tab--active" : ""}`}
              >
                {t.label}
                {t.badge > 0 && (
                  <span className="um-tab__badge" style={{ background: t.badgeBg }}>
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <style jsx>{`
          .um-tabs {
            display: inline-flex;
            gap: 4px;
            padding: 5px;
            border-radius: 12px;
            background: var(--surface-subtle);
            border: 1px solid var(--border-subtle);
          }
          .um-tab {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 9px 18px;
            border: none;
            border-radius: 8px;
            background: transparent;
            color: var(--text-muted);
            font-family: "Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif;
            font-size: 14px;
            font-weight: 800;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            cursor: pointer;
            transition: background 0.15s ease, color 0.15s ease;
          }
          .um-tab:hover {
            color: var(--text-primary);
            background: var(--surface-muted);
          }
          .um-tab--active,
          .um-tab--active:hover {
            color: var(--text-inverse);
            background: linear-gradient(90deg, #b30002, #e01418);
            box-shadow: 0 2px 8px rgba(202, 0, 2, 0.32);
          }
          .um-tab__badge {
            color: var(--text-inverse);
            font-family: system-ui, sans-serif;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0;
            padding: 1px 8px;
            border-radius: 999px;
            min-width: 20px;
            text-align: center;
          }
          .um-tab--active .um-tab__badge {
            background: rgba(255, 255, 255, 0.28) !important;  /* tokens-guard-ignore: fixed-brand */
          }
        `}</style>
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
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🗑️</div>
                <div style={{ fontSize: 16, fontWeight: 500 }}>No deleted users</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {deletedUsers.map((user) => (
                  <div key={user.id} style={{ padding: 16, backgroundColor: "var(--surface-subtle)", borderLeft: "3px solid #e01418", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{user.name}</div>
                      <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 4 }}>
                        {(user.roles || [user.role]).map((r) => r.toUpperCase()).join(", ")} • {user.email}
                      </div>
                      {user.deletedAt && (
                        <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
                          Deleted: {new Date(user.deletedAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        className="btn-secondary btn-success"
                        onClick={async () => {
                          if (await appConfirm(`Restore ${user.name}? They will be able to log in again.`)) {
                            try {
                              await fetch(`/api/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore" }) });
                              await reloadUsers();
                              alert(`${user.name} has been restored successfully!`);
                            } catch (error) {
                              console.error("Failed to restore user:", error);
                              alert("Failed to restore user");
                            }
                          }
                        }}
                      >
                        Restore User
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          style={{ background: "#ef4444", color: "var(--text-inverse)", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                          onClick={async () => {
                            if (await appConfirm(`⚠️ PERMANENTLY DELETE ${user.name}?\n\nThis CANNOT be undone. All data will be lost forever.`)) {
                              try {
                                await fetch(`/api/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "permanent-delete" }) });
                                await reloadUsers();
                              } catch (error) {
                                console.error("Failed to permanently delete user:", error);
                                alert("Failed to permanently delete user");
                              }
                            }
                          }}
                        >
                          Delete Permanently
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <UserRequests onUserApproved={reloadUsers} />
      )}
    </>
  );
}
