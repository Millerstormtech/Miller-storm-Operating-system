// pages/sales/calendar.tsx
import type { NextPage } from "next";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { SalesLayout } from "../../src/portals/sales/SalesLayout";
import { MyCalendar } from "../../src/components/MyCalendar";
import { useAuth } from "../../src/contexts/AuthContext";

const Calendar: NextPage = () => {
  const { user } = useAuth();
  return (
    <ProtectedRoute allowedRoles={["sales", "sales-team-lead", "admin"]}>
      <SalesLayout currentView="calendar" userName={user?.name} userId={user?.id}>
        <div style={{ padding: 24 }}>
          <MyCalendar />
        </div>
      </SalesLayout>
    </ProtectedRoute>
  );
};

export default Calendar;
