// pages/manager/calendar.tsx
import type { NextPage } from "next";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { SalesTeamLeadLayout } from "../../src/portals/manager/SalesTeamLeadLayout";
import { MyCalendar } from "../../src/components/MyCalendar";

const ManagerCalendar: NextPage = () => {
  return (
    <ProtectedRoute allowedRoles={["sales-team-lead", "admin"]}>
      <SalesTeamLeadLayout currentView="calendar">
        <div style={{ padding: 24 }}>
          <MyCalendar />
        </div>
      </SalesTeamLeadLayout>
    </ProtectedRoute>
  );
};

export default ManagerCalendar;
