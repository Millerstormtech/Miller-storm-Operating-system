// pages/branch-manager/calendar.tsx
import type { NextPage } from "next";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { BranchManagerLayout } from "../../src/portals/branch-manager/BranchManagerLayout";
import { MyCalendar } from "../../src/components/MyCalendar";

const BranchManagerCalendarPage: NextPage = () => {
  return (
    <ProtectedRoute allowedRoles={["branch-manager"]}>
      <BranchManagerLayout currentView="calendar">
        <div style={{ padding: 24 }}>
          <MyCalendar />
        </div>
      </BranchManagerLayout>
    </ProtectedRoute>
  );
};

export default BranchManagerCalendarPage;
