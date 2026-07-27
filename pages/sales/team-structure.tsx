import type { NextPage } from "next";
import { SalesLayout } from "../../src/portals/sales/SalesLayout";
import { TeamStructure } from "../../src/components/TeamStructure";
import { useAuth } from "../../src/contexts/AuthContext";

const SalesTeamStructurePage: NextPage = () => {
  const { user } = useAuth();
  if (!user) return <div>Loading...</div>;
  return (
    <SalesLayout
      currentView="team-structure"
      userName={user.name}
      userId={user.id}
      pageTitle="Organization Chart"
      pageSubtitle="Live org chart, built automatically from registered users and their roles."
    >
      <div style={{ padding: "0 24px 24px" }}>
        <TeamStructure />
      </div>
    </SalesLayout>
  );
};

export default SalesTeamStructurePage;
