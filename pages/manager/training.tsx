import type { NextPage } from "next";
import { useEffect, useState } from "react";
import { ManagerLayout } from "../../src/portals/manager/ManagerLayout";
import { TeamTrainingProgressPage } from "../../src/portals/manager/TeamTrainingProgress";
import { UserProfile, Course, AuthenticatedUser } from "../../src/types";

const TrainingPage: NextPage = () => {
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const currentUser: AuthenticatedUser = { id: "manager-1", name: "Manager", role: "manager" };

  useEffect(() => {
    async function loadData() {
      try {
        const [usersRes, coursesRes] = await Promise.all([
          fetch("/api/users"),
          fetch(`/api/courses?userId=${currentUser.id}&userRole=${currentUser.role}&t=${Date.now()}`)
        ]);
        if (usersRes.ok) {
          const users = await usersRes.json();
          setTeamMembers(users.filter((u: UserProfile) => u.role === "sales"));
        }
        if (coursesRes.ok) setCourses(await coursesRes.json());
      } catch (error) {
        console.error("Failed to load training data:", error);
      }
    }
    loadData();
  }, []);

  return (
    <ManagerLayout currentView="training">
      <TeamTrainingProgressPage currentUser={currentUser} teamMembers={teamMembers} courses={courses} />
    </ManagerLayout>
  );
};

export default TrainingPage;
