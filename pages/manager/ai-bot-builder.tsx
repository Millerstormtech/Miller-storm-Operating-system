import type { NextPage } from "next";
import { ManagerLayout } from "../../src/portals/manager/ManagerLayout";
import { AiBotBuilder } from "../../src/portals/admin/AiBotBuilder";

const ManagerAiBotBuilderPage: NextPage = () => {
  return (
    <ManagerLayout currentView="ai-bot-builder">
      <AiBotBuilder />
    </ManagerLayout>
  );
};

export default ManagerAiBotBuilderPage;
