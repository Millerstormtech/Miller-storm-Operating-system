import type { NextPage } from "next";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { BranchManagerLayout } from "../../src/portals/branch-manager/BranchManagerLayout";
import { AnnouncementComposer } from "../../src/portals/admin/AnnouncementComposer";

const BranchManagerAnnouncementsPage: NextPage = () => {
  return (
    <ProtectedRoute allowedRoles={["branch-manager"]}>
      <BranchManagerLayout currentView="announcements" pageTitle="Announcements">
        <AnnouncementComposer />
      </BranchManagerLayout>
    </ProtectedRoute>
  );
};

export default BranchManagerAnnouncementsPage;
