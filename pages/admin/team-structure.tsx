import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { TeamStructure } from "../../src/components/TeamStructure";

const AdminTeamStructurePage: NextPage = () => (
  <AdminPageWrapper
    currentView="teamStructure"
    pageTitle="Organization Chart"
      pageSubtitle="Built automatically from registered users and their roles"
  >
    <div style={{ padding: 24 }}>
      <TeamStructure />
    </div>
  </AdminPageWrapper>
);

export default AdminTeamStructurePage;
