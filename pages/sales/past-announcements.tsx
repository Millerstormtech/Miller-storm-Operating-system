import type { NextPage } from "next";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { SalesLayout } from "../../src/portals/sales/SalesLayout";
import { PastAnnouncements } from "../../src/components/PastAnnouncements";
import { useAuth } from "../../src/contexts/AuthContext";

const SalesPastAnnouncementsPage: NextPage = () => {
  const { user } = useAuth();
  return (
    <ProtectedRoute allowedRoles={["sales"]}>
      <SalesLayout currentView="past-announcements" pageTitle="Past Announcements" userName={user?.name} userId={user?.id}>
        <PastAnnouncements />
      </SalesLayout>
    </ProtectedRoute>
  );
};

export default SalesPastAnnouncementsPage;
