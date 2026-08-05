import type { NextPage } from "next";
import { MarketingLayout } from "../../src/portals/marketing/MarketingLayout";
import { ScoreboardHome } from "../../src/portals/shared/scoreboard/ScoreboardHome";

const DashboardPage: NextPage = () => {
  return (
    <MarketingLayout currentView="dashboard">
      <ScoreboardHome />
    </MarketingLayout>
  );
};

export default DashboardPage;
