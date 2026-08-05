import type { NextPage } from "next";
import { SalesTeamLeadLayout } from "../../src/portals/manager/SalesTeamLeadLayout";
import { ScoreboardHome } from "../../src/portals/shared/scoreboard/ScoreboardHome";

const DashboardPage: NextPage = () => {
  return (
    <SalesTeamLeadLayout currentView="dashboard">
      <ScoreboardHome />
    </SalesTeamLeadLayout>
  );
};

export default DashboardPage;
