import type { NextPage } from "next";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { CLevelLayout } from "../../src/portals/c-level/CLevelLayout";
import { AnnouncementComposer } from "../../src/portals/admin/AnnouncementComposer";

const CLevelAnnouncementsPage: NextPage = () => {
  return (
    <ProtectedRoute allowedRoles={["c-level"]}>
      <CLevelLayout currentView="announcements" pageTitle="Announcements">
        <AnnouncementComposer />
      </CLevelLayout>
    </ProtectedRoute>
  );
};

export default CLevelAnnouncementsPage;
