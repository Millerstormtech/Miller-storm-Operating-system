// pages/c-level/calendar.tsx
import type { NextPage } from "next";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { CLevelLayout } from "../../src/portals/c-level/CLevelLayout";
import { MyCalendar } from "../../src/components/MyCalendar";

const CLevelCalendarPage: NextPage = () => {
  return (
    <ProtectedRoute allowedRoles={["c-level"]}>
      <CLevelLayout currentView="calendar">
        <div style={{ padding: 24 }}>
          <MyCalendar />
        </div>
      </CLevelLayout>
    </ProtectedRoute>
  );
};

export default CLevelCalendarPage;
