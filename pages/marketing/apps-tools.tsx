import type { NextPage } from "next";
import { MarketingLayout } from "../../src/portals/marketing/MarketingLayout";
import { AppsToolsViewer } from "../../src/components/AppsToolsViewer";

const MarketingAppsToolsPage: NextPage = () => {
  return (
    <MarketingLayout currentView="apps-tools">
      <div className="page-header">
        <h1 className="page-title">Apps & Tools</h1>
      </div>
      <AppsToolsViewer portal="marketing" />
    </MarketingLayout>
  );
};

export default MarketingAppsToolsPage;
