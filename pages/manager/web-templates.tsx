import type { NextPage } from "next";
import { useEffect, useState } from "react";
import { ManagerLayout } from "../../src/portals/manager/ManagerLayout";
import { WebTemplatesPage } from "../../src/portals/manager/WebTemplates";
import { useAuth } from "../../src/contexts/AuthContext";
import { UserProfile } from "../../src/types";

const WebTemplatesRoute: NextPage = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);

  useEffect(() => {
    async function loadUsers() {
      try {
        const res = await fetch("/api/users");
        if (res.ok) {
          const data = await res.json();
          setUsers(data);
        }
      } catch (error) {
        console.error("Failed to load users:", error);
      }
    }
    loadUsers();
  }, []);

  async function handleUsersChange(updatedUsers: UserProfile[]) {
    setUsers(updatedUsers);
    try {
      await fetch("/api/users/bulk", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedUsers)
      });
    } catch (error) {
      console.error("Failed to update users:", error);
    }
  }

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <ManagerLayout currentView="webTemplates">
      <WebTemplatesPage 
        users={users} 
        managerId={user.id}
        onUsersChange={handleUsersChange} 
      />
    </ManagerLayout>
  );
};

export default WebTemplatesRoute;
