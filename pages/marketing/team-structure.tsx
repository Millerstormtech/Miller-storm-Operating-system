import type { NextPage } from "next";
import { MarketingLayout } from "../../src/portals/marketing/MarketingLayout";
import { TeamStructure } from "../../src/components/TeamStructure";
import { useAuth } from "../../src/contexts/AuthContext";

const MarketingTeamStructurePage: NextPage = () => {
  const { user } = useAuth();
  if (!user) return <div>Loading...</div>;
  return (
    <MarketingLayout
      currentView="team-structure"
      pageTitle="Organization Chart"
      pageSubtitle="Built automatically from registered users and their roles"
    >
      <div style={{ padding: 24 }}>
        <TeamStructure />
      </div>
    </MarketingLayout>
  );
};

export default MarketingTeamStructurePage;
