import type { NextPage } from "next";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { BranchManagerLayout } from "../../src/portals/branch-manager/BranchManagerLayout";
import { PastAnnouncements } from "../../src/components/PastAnnouncements";

const BranchManagerPastAnnouncementsPage: NextPage = () => {
  return (
    <ProtectedRoute allowedRoles={["branch-manager"]}>
      <BranchManagerLayout currentView="past-announcements" pageTitle="Past Announcements">
        <PastAnnouncements />
      </BranchManagerLayout>
    </ProtectedRoute>
  );
};

export default BranchManagerPastAnnouncementsPage;
