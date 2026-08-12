import type { NextPage } from "next";
import { BranchManagerLayout } from "../../src/portals/branch-manager/BranchManagerLayout";
import { TeamStructure } from "../../src/components/TeamStructure";

const BranchManagerTeamStructurePage: NextPage = () => (
  <BranchManagerLayout
    currentView="team-structure"
    pageTitle="Organization Chart"
      pageSubtitle="Built automatically from registered users and their roles"
  >
    <div style={{ padding: 24 }}>
      <TeamStructure />
    </div>
  </BranchManagerLayout>
);

export default BranchManagerTeamStructurePage;
