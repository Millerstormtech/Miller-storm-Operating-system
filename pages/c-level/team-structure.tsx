import type { NextPage } from "next";
import { CLevelLayout } from "../../src/portals/c-level/CLevelLayout";
import { TeamStructure } from "../../src/components/TeamStructure";

const CLevelTeamStructurePage: NextPage = () => (
  <CLevelLayout
    currentView="team-structure"
    pageTitle="Organization Chart"
    pageSubtitle="Live org chart of the whole company, built automatically from registered users and their roles."
  >
    <div style={{ padding: "0 24px 24px" }}>
      <TeamStructure />
    </div>
  </CLevelLayout>
);

export default CLevelTeamStructurePage;
