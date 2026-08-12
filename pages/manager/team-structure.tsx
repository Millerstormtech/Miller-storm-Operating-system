import type { NextPage } from "next";
import { SalesTeamLeadLayout } from "../../src/portals/manager/SalesTeamLeadLayout";
import { TeamStructure } from "../../src/components/TeamStructure";

const ManagerTeamStructurePage: NextPage = () => (
  <SalesTeamLeadLayout
    currentView="team-structure"
    pageTitle="Organization Chart"
      pageSubtitle="Built automatically from registered users and their roles"
  >
    <div style={{ padding: 24 }}>
      <TeamStructure />
    </div>
  </SalesTeamLeadLayout>
);

export default ManagerTeamStructurePage;
