import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";

const RoleHierarchyPage: NextPage = () => {
  return (
    <AdminPageWrapper currentView="roleHierarchy">
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
import { useEffect, useState } from "react";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { RoleHierarchyManager } from "../../src/portals/admin/RoleHierarchy";
import { UserProfile } from "../../src/types";

const RoleHierarchyPage: NextPage = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/users");
        if (res.ok) setUsers(await res.json());
      } catch (error) {
        console.error("Failed to load users:", error);
      }
    }
    loadData();
  }, []);

  function handleUsersChange(next: UserProfile[]) {
    setUsers(next);
    fetch("/api/users/bulk", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next)
    }).catch((err) => console.error("Failed to save users:", err));
  }

  return (
    <AdminPageWrapper currentView="roleHierarchy">
      <RoleHierarchyManager users={users} onUsersChange={handleUsersChange} />
    </AdminPageWrapper>
  );
};
*/}

export default RoleHierarchyPage;
