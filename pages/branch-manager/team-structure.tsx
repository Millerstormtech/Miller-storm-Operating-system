import type { NextPage } from "next";
import { BranchManagerLayout } from "../../src/portals/branch-manager/BranchManagerLayout";
import { TeamStructure } from "../../src/components/TeamStructure";

const BranchManagerTeamStructurePage: NextPage = () => (
  <BranchManagerLayout
    currentView="team-structure"
    pageTitle="Organization Chart"
    pageSubtitle="Live org chart of the whole company, built automatically from registered users and their roles."
  >
    <div style={{ padding: "0 24px 24px" }}>
      <TeamStructure />
    </div>
  </BranchManagerLayout>
);

export default BranchManagerTeamStructurePage;
