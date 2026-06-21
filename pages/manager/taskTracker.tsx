import type { NextPage } from "next";
import { useEffect, useState } from "react";
import { ManagerLayout } from "../../src/portals/manager/ManagerLayout";
import { TaskTracker } from "../../src/portals/manager/TaskTracker";
import { UserProfile, Course } from "../../src/types";

const TaskTrackerPage: NextPage = () => {
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const [usersRes, coursesRes] = await Promise.all([
          fetch("/api/users"),
          fetch("/api/courses")
        ]);
        if (usersRes.ok) {
          const users = await usersRes.json();
          setTeamMembers(users.filter((u: UserProfile) => u.role === "sales"));
        }
        if (coursesRes.ok) setCourses(await coursesRes.json());
      } catch (error) {
        console.error("Failed to load task tracker data:", error);
      }
    }
    loadData();
  }, []);

  return (
    <ManagerLayout currentView="taskTracker">
      <TaskTracker teamMembers={teamMembers} courses={courses} />
    </ManagerLayout>
  );
};

export default TaskTrackerPage;
