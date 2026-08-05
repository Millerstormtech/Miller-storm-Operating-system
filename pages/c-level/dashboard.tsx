import type { NextPage } from "next";
import { CLevelLayout } from "../../src/portals/c-level/CLevelLayout";
import { ScoreboardHome } from "../../src/portals/shared/scoreboard/ScoreboardHome";

const CLevelDashboardPage: NextPage = () => {
  return (
    <CLevelLayout currentView="dashboard">
      <ScoreboardHome />
    </CLevelLayout>
  );
};

export default CLevelDashboardPage;
