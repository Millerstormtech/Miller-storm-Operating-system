import type { NextPage } from "next";
import { ManagerLayout } from "../../src/portals/manager/ManagerLayout";
import { TeamStructure } from "../../src/components/TeamStructure";

const ManagerTeamStructurePage: NextPage = () => (
  <ManagerLayout currentView="team-structure">
    <div className="page-header">
      <h1 className="page-title">Team Structure</h1>
    </div>
    <div style={{ padding: "0 24px 24px" }}>
      <p style={{ margin: "0 0 20px", color: "#6b7280", fontSize: 14 }}>
        Live org chart, built automatically from registered users and their roles.
      </p>
      <TeamStructure />
    </div>
  </ManagerLayout>
);

export default ManagerTeamStructurePage;
