import type { NextPage } from "next";
import { MarketingLayout } from "../../src/portals/marketing/MarketingLayout";
import { AppsToolsViewer } from "../../src/components/AppsToolsViewer";

const MarketingAppsToolsPage: NextPage = () => {
  return (
    <MarketingLayout currentView="apps-tools">
      <AppsToolsViewer portal="marketing" />
    </MarketingLayout>
  );
};

export default MarketingAppsToolsPage;
