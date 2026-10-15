import type { NextPage } from "next";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { SalesTeamLeadLayout } from "../../src/portals/manager/SalesTeamLeadLayout";
import { PastAnnouncements } from "../../src/components/PastAnnouncements";

const SalesTeamLeadPastAnnouncementsPage: NextPage = () => {
  return (
    <ProtectedRoute allowedRoles={["sales-team-lead"]}>
      <SalesTeamLeadLayout currentView="past-announcements" pageTitle="Past Announcements">
        <PastAnnouncements />
      </SalesTeamLeadLayout>
    </ProtectedRoute>
  );
};

export default SalesTeamLeadPastAnnouncementsPage;
