import type { NextPage } from "next";
import { useEffect, useState } from "react";
import { SalesTeamLeadLayout } from "../../src/portals/manager/SalesTeamLeadLayout";
import { ManagerDashboard } from "../../src/portals/manager/Dashboard";
import { NewCoursePopup } from "../../src/components/NewCoursePopup";
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
    <SalesTeamLeadLayout currentView="dashboard">
      <NewCoursePopup />
      <ManagerDashboard teamMembers={teamMembers} />
    </SalesTeamLeadLayout>
  );
};

export default DashboardPage;
