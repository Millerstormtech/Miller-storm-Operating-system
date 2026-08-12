import type { NextPage } from "next";
import { CLevelLayout } from "../../src/portals/c-level/CLevelLayout";
import { TeamStructure } from "../../src/components/TeamStructure";

const CLevelTeamStructurePage: NextPage = () => (
  <CLevelLayout
    currentView="team-structure"
    pageTitle="Organization Chart"
      pageSubtitle="Built automatically from registered users and their roles"
  >
    <div style={{ padding: 24 }}>
      <TeamStructure />
    </div>
  </CLevelLayout>
);

export default CLevelTeamStructurePage;
