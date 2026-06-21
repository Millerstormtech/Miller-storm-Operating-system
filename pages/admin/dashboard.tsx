import type { NextPage } from "next";
import { useEffect, useState } from "react";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { AdminDashboard } from "../../src/portals/admin/Dashboard";
import { Course, UserProfile } from "../../src/types";

const DashboardPage: NextPage = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [businessPlans, setBusinessPlans] = useState<any[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const [usersRes, coursesRes, plansRes] = await Promise.all([
          fetch("/api/users"),
          fetch("/api/courses"),
          fetch("/api/business-plan")
        ]);
        if (usersRes.ok) setUsers(await usersRes.json());
        if (coursesRes.ok) setCourses(await coursesRes.json());
        if (plansRes.ok) setBusinessPlans(await plansRes.json());
      } catch (error) {
        console.error("Failed to load admin dashboard data:", error);
      }
    }
    loadData();
  }, []);

  return (
    <AdminPageWrapper currentView="dashboard">
      <AdminDashboard users={users} courses={courses} businessPlans={businessPlans} />
    </AdminPageWrapper>
  );
};

export default DashboardPage;
