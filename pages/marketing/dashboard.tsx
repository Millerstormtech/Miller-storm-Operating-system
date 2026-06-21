import type { NextPage } from "next";
import { MarketingLayout } from "../../src/portals/marketing/MarketingLayout";
import { MarketingDashboard } from "../../src/portals/marketing/Dashboard";

const DashboardPage: NextPage = () => {
  return (
    <MarketingLayout currentView="dashboard">
      <MarketingDashboard />
    </MarketingLayout>
  );
};

export default DashboardPage;
