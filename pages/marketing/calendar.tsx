// pages/marketing/calendar.tsx
import type { NextPage } from "next";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { MarketingLayout } from "../../src/portals/marketing/MarketingLayout";
import { MyCalendar } from "../../src/components/MyCalendar";

const MarketingCalendar: NextPage = () => {
  return (
    <ProtectedRoute allowedRoles={["marketing", "admin"]}>
      <MarketingLayout currentView="calendar">
        <div style={{ padding: "0 24px 24px" }}>
          <MyCalendar />
        </div>
      </MarketingLayout>
    </ProtectedRoute>
  );
};

export default MarketingCalendar;
