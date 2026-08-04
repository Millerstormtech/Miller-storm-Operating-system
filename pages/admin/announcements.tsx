import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { AnnouncementComposer } from "../../src/portals/admin/AnnouncementComposer";

const AnnouncementsPage: NextPage = () => {
  return (
    <AdminPageWrapper currentView="announcements" pageTitle="Announcements" backTo="/admin/user-management">
      <AnnouncementComposer />
    </AdminPageWrapper>
  );
};

export default AnnouncementsPage;
