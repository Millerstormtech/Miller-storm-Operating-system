import type { NextPage } from "next";
import { MarketingLayout } from "../../src/portals/marketing/MarketingLayout";
import { Placeholder } from "../../src/portals/marketing/Placeholder";

const ApprovalsPage: NextPage = () => {
  return (
    <MarketingLayout currentView="approvals">
      <Placeholder
        title="Content Approvals"
        description="Track content requests and approvals across the org."
      />
    </MarketingLayout>
  );
};

export default ApprovalsPage;
