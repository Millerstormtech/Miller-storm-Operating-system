import type { NextPage } from "next";
import { MarketingLayout } from "../../src/portals/marketing/MarketingLayout";
import { MarketingMaterialsViewer } from "../../src/components/MarketingMaterialsViewer";

const AssetsPage: NextPage = () => {
  return (
    <MarketingLayout currentView="assets">
      <div className="page-header">
        <h1 className="page-title">Marketing Assets</h1>
      </div>
      <MarketingMaterialsViewer />
    </MarketingLayout>
  );
};

export default AssetsPage;
