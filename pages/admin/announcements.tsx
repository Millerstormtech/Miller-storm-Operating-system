import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { AnnouncementComposer } from "../../src/portals/admin/AnnouncementComposer";

const AnnouncementsPage: NextPage = () => {
  return (
    <AdminPageWrapper currentView="announcements" pageTitle="Announcements" backTo="/admin/user-management">
      {/* Faded brand logo watermark behind the page content, like the other panels. */}
      <div style={{ position: "relative" }}>
        <AnnouncementComposer />
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 4,
            backgroundImage: "url(/ChatGPT_Image_Feb_23__2026__07_00_52_PM-removebg-preview.png)",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
            backgroundSize: "min(640px, 52%)",
            opacity: 0.05,
            pointerEvents: "none",
          }}
        />
      </div>
    </AdminPageWrapper>
  );
};

export default AnnouncementsPage;
