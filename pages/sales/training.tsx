import type { NextPage } from "next";
import React, { useEffect, useState } from "react";
import { SalesLayout } from "../../src/portals/sales/SalesLayout";
import { TrainingCenter } from "../../src/portals/sales/TrainingCenter";
import { useAuth } from "../../src/contexts/AuthContext";
import { Course } from "../../src/types";

const TrainingCenterComponent = TrainingCenter as React.ComponentType<{ courses: Course[]; isLoading?: boolean }>;

const Training: NextPage = () => {
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
        const coursesRes = await fetch(`/api/courses?userId=${user.id}&userRole=${user.role}&t=${Date.now()}`);
        if (coursesRes.ok && mounted) {
          const data = await coursesRes.json();
          // Sort courses by order field
          const sortedData = data.sort((a: Course, b: Course) => {
            const orderA = a.order ?? 999999;
            const orderB = b.order ?? 999999;
            return orderA - orderB;
          });
          setCourses(sortedData);
        }
      } catch (error) {
        console.error("Failed to load courses:", error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    
    if (user?.id) {
      loadCourses();
    }
    
    return () => {
      mounted = false;
    };
  }, [user?.id, user?.role]);

  if (!user) {
    return (
      <SalesLayout currentView="training">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
            <div style={{ color: '#6b7280' }}>Loading...</div>
          </div>
        </div>
      </SalesLayout>
    );
  }

  return (
    <SalesLayout currentView="training">
      <TrainingCenterComponent courses={courses} isLoading={isLoading} />
    </SalesLayout>
  );
};

export default Training;
