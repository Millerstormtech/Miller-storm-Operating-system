import type { NextPage } from "next";
import { useEffect, useState } from "react";
import { ManagerLayout } from "../../src/portals/manager/ManagerLayout";
import { ManagerDashboard } from "../../src/portals/manager/Dashboard";
import { UserProfile } from "../../src/types";

const DashboardPage: NextPage = () => {
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const usersRes = await fetch("/api/users");
        if (usersRes.ok) {
          const users = await usersRes.json();
          setTeamMembers(users.filter((u: UserProfile) => u.role === "sales"));
        }
      } catch (error) {
        console.error("Failed to load manager dashboard data:", error);
      }
    }
    loadData();
  }, []);

  return (
    <ManagerLayout currentView="dashboard">
      <ManagerDashboard teamMembers={teamMembers} />
    </ManagerLayout>
  );
};

export default DashboardPage;
