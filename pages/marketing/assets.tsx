import type { NextPage } from "next";
import { MarketingLayout } from "../../src/portals/marketing/MarketingLayout";
import { MarketingMaterialsViewer } from "../../src/components/MarketingMaterialsViewer";

const AssetsPage: NextPage = () => {
  return (
    <MarketingLayout currentView="assets">
      <MarketingMaterialsViewer />
    </MarketingLayout>
  );
};

export default AssetsPage;
