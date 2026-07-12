import type { NextPage } from "next";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { BranchManagerLayout } from "../../src/portals/branch-manager/BranchManagerLayout";
import { ManagerOnlineTrainingPage } from "../../src/portals/manager/OnlineTraining";
import { Course, AuthenticatedUser } from "../../src/types";
import { useAuth } from "../../src/contexts/AuthContext";

const BranchManagerTrainingPage: NextPage = () => {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (!user) return;

    let mounted = true;
    async function loadData() {
      setIsLoading(true);
      try {
        const coursesRes = await fetch(`/api/courses?userId=${user!.id}&userRole=${user!.role}&t=${Date.now()}`);
        if (coursesRes.ok && mounted) {
          const data = await coursesRes.json();
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
    loadData();
    return () => {
      mounted = false;
    };
  }, [user, authLoading, router]);

  if (authLoading || !user) return null;

  const currentUser: AuthenticatedUser = { id: user.id, name: user.name, role: user.role };

  return (
    <BranchManagerLayout currentView="training">
      {/* companyWide → Branch Manager can assign playlists / unlock lessons for ANY rep,
          not just one manager's team. */}
      <ManagerOnlineTrainingPage currentUser={currentUser} courses={courses} isLoading={isLoading} companyWide />
    </BranchManagerLayout>
  );
};

export default BranchManagerTrainingPage;
