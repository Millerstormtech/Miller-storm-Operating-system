// pages/sales/rankings.tsx
import type { NextPage } from "next";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { SalesLayout } from "../../src/portals/sales/SalesLayout";
import { RankingsPage } from "../../src/portals/sales/RankingsPage";
import { useAuth } from "../../src/contexts/AuthContext";

const Rankings: NextPage = () => {
  const { user } = useAuth();
  return (
    <ProtectedRoute allowedRoles={["sales", "manager", "admin"]}>
      <SalesLayout currentView="rankings" userName={user?.name} userId={user?.id}>
        <RankingsPage currentUserId={user?.id} />
      </SalesLayout>
    </ProtectedRoute>
  );
};

export default Rankings;
