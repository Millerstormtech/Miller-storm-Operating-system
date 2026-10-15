import type { NextPage } from "next";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { MarketingLayout } from "../../src/portals/marketing/MarketingLayout";
import { PastAnnouncements } from "../../src/components/PastAnnouncements";

const MarketingPastAnnouncementsPage: NextPage = () => {
  return (
    <ProtectedRoute allowedRoles={["marketing"]}>
      <MarketingLayout currentView="past-announcements" pageTitle="Past Announcements">
        <PastAnnouncements />
      </MarketingLayout>
    </ProtectedRoute>
  );
};

export default MarketingPastAnnouncementsPage;
