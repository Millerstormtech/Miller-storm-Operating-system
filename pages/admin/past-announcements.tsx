import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { PastAnnouncements } from "../../src/components/PastAnnouncements";

const AdminPastAnnouncementsPage: NextPage = () => {
  return (
    <AdminPageWrapper currentView="past-announcements" pageTitle="Past Announcements">
      <PastAnnouncements />
    </AdminPageWrapper>
  );
};

export default AdminPastAnnouncementsPage;
