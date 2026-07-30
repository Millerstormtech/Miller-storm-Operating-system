import type { NextPage } from "next";
import React, { useEffect, useState } from "react";
import { MarketingLayout } from "../../src/portals/marketing/MarketingLayout";
import { TrainingCenter } from "../../src/portals/sales/TrainingCenter";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { useAuth } from "../../src/contexts/AuthContext";
import { Course } from "../../src/types";

const TrainingCenterComponent = TrainingCenter as React.ComponentType<{ courses: Course[]; isLoading?: boolean }>;

const MarketingTrainingPage: NextPage = () => {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadCourses() {
      if (!user?.id) {
        if (mounted) setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        // list=1 → light payload (no lesson HTML/transcripts); full course
        // content loads on demand when a course is opened.
        const coursesRes = await fetch(`/api/courses?userId=${user.id}&userRole=${user.role}&list=1`);
        if (coursesRes.ok && mounted) {
          const data = await coursesRes.json();
          const sortedData = data.sort((a: Course, b: Course) => (a.order ?? 999999) - (b.order ?? 999999));
          setCourses(sortedData);
        }
      } catch (error) {
        console.error("Failed to load courses:", error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    if (user?.id) loadCourses();
    return () => { mounted = false; };
  }, [user?.id, user?.role]);

  if (!user) return <div>Loading...</div>;

  return (
    <ProtectedRoute allowedRoles={["marketing", "admin"]}>
      <MarketingLayout currentView="training">
        <TrainingCenterComponent courses={courses} isLoading={isLoading} />
      </MarketingLayout>
    </ProtectedRoute>
  );
};

export default MarketingTrainingPage;
