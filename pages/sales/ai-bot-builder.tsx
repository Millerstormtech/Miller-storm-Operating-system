import type { NextPage } from "next";
import { SalesLayout } from "../../src/portals/sales/SalesLayout";
import { AiBotBuilder } from "../../src/portals/admin/AiBotBuilder";
import { useAuth } from "../../src/contexts/AuthContext";

const SalesAiBotBuilderPage: NextPage = () => {
  const { user } = useAuth();
  if (!user) return <div>Loading...</div>;
  return (
    <SalesLayout currentView="ai-bot-builder" userName={user.name} userId={user.id}>
      <AiBotBuilder />
    </SalesLayout>
  );
};

export default SalesAiBotBuilderPage;
