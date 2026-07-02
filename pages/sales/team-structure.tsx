import type { NextPage } from "next";
import { SalesLayout } from "../../src/portals/sales/SalesLayout";
import { TeamStructure } from "../../src/components/TeamStructure";
import { useAuth } from "../../src/contexts/AuthContext";

const SalesTeamStructurePage: NextPage = () => {
  const { user } = useAuth();
  if (!user) return <div>Loading...</div>;
  return (
    <SalesLayout currentView="team-structure" userName={user.name} userId={user.id}>
      <div className="page-header">
        <h1 className="page-title">Team Structure</h1>
      </div>
      <div style={{ padding: "0 24px 24px" }}>
        <p style={{ margin: "0 0 20px", color: "#6b7280", fontSize: 14 }}>
          Live org chart, built automatically from registered users and their roles.
        </p>
        <TeamStructure />
      </div>
    </SalesLayout>
  );
};

export default SalesTeamStructurePage;
