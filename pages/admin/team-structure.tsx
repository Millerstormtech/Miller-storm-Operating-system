import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { TeamStructure } from "../../src/components/TeamStructure";

const AdminTeamStructurePage: NextPage = () => (
  <AdminPageWrapper currentView="teamStructure">
    <div style={{ padding: 24 }}>
      <h1 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 700 }}>Team Structure</h1>
      <p style={{ margin: "0 0 20px", color: "#6b7280", fontSize: 14 }}>
        Live org chart, built automatically from registered users and their roles.
      </p>
      <TeamStructure />
    </div>
  </AdminPageWrapper>
);

export default AdminTeamStructurePage;
