import type { NextPage } from "next";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { SalesTeamLeadLayout } from "../../src/portals/manager/SalesTeamLeadLayout";
import { AnnouncementComposer } from "../../src/portals/admin/AnnouncementComposer";

const SalesTeamLeadAnnouncementsPage: NextPage = () => {
  return (
    <ProtectedRoute allowedRoles={["sales-team-lead"]}>
      <SalesTeamLeadLayout currentView="announcements" pageTitle="Announcements">
        <AnnouncementComposer />
      </SalesTeamLeadLayout>
    </ProtectedRoute>
  );
};

export default SalesTeamLeadAnnouncementsPage;
