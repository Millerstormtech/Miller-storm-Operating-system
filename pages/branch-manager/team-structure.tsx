import type { NextPage } from "next";
import { BranchManagerLayout } from "../../src/portals/branch-manager/BranchManagerLayout";
import { TeamStructure } from "../../src/components/TeamStructure";

const BranchManagerTeamStructurePage: NextPage = () => (
  <BranchManagerLayout currentView="team-structure">
    <div className="page-header">
      <h1 className="page-title">Team Structure</h1>
    </div>
    <div style={{ padding: "0 24px 24px" }}>
      <p style={{ margin: "0 0 20px", color: "#6b7280", fontSize: 14 }}>
        Live org chart of the whole company, built automatically from registered users and their roles.
      </p>
      <TeamStructure />
    </div>
  </BranchManagerLayout>
);

export default BranchManagerTeamStructurePage;
