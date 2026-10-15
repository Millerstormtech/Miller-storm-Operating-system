import type { NextPage } from "next";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { CLevelLayout } from "../../src/portals/c-level/CLevelLayout";
import { PastAnnouncements } from "../../src/components/PastAnnouncements";

const CLevelPastAnnouncementsPage: NextPage = () => {
  return (
    <ProtectedRoute allowedRoles={["c-level"]}>
      <CLevelLayout currentView="past-announcements" pageTitle="Past Announcements">
        <PastAnnouncements />
      </CLevelLayout>
    </ProtectedRoute>
  );
};

export default CLevelPastAnnouncementsPage;
