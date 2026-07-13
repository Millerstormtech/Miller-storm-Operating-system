import type { NextPage } from "next";
import { SalesTeamLeadLayout } from "../../src/portals/manager/SalesTeamLeadLayout";
import { AiBotBuilder } from "../../src/portals/admin/AiBotBuilder";

const ManagerAiBotBuilderPage: NextPage = () => {
  return (
    <SalesTeamLeadLayout currentView="ai-bot-builder">
      <AiBotBuilder />
    </SalesTeamLeadLayout>
  );
};

export default ManagerAiBotBuilderPage;
