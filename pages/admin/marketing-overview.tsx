import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { MarketingOverview } from "../../src/portals/admin/MarketingOverview";

const MarketingOverviewPage: NextPage = () => {
  return (
    <AdminPageWrapper currentView="marketingOverview">
      <MarketingOverview />
    </AdminPageWrapper>
  );
};

export default MarketingOverviewPage;
