import type { NextPage } from "next";
import { MarketingLayout } from "../../src/portals/marketing/MarketingLayout";
import { AiBotBuilder } from "../../src/portals/admin/AiBotBuilder";

const MarketingAiBotBuilderPage: NextPage = () => {
  return (
    <MarketingLayout currentView="ai-bot-builder">
      <AiBotBuilder />
    </MarketingLayout>
  );
};

export default MarketingAiBotBuilderPage;
