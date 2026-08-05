import type { NextPage } from "next";
import { BranchManagerLayout } from "../../src/portals/branch-manager/BranchManagerLayout";
import { ScoreboardHome } from "../../src/portals/shared/scoreboard/ScoreboardHome";

const BranchManagerDashboardPage: NextPage = () => {
  return (
    <BranchManagerLayout currentView="dashboard">
      <ScoreboardHome />
    </BranchManagerLayout>
  );
};

export default BranchManagerDashboardPage;
