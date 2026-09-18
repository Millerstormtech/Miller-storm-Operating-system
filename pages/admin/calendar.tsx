import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { MyCalendar } from "../../src/components/MyCalendar";

const AdminCalendarPage: NextPage = () => {
  return (
    <AdminPageWrapper currentView="calendar" pageTitle="Calendar">
      <div style={{ padding: 24 }}>
        <MyCalendar />
      </div>
    </AdminPageWrapper>
  );
};

export default AdminCalendarPage;
