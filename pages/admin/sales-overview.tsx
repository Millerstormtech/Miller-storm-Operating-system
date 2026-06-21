import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { SalesOverview } from "../../src/portals/admin/SalesOverview";

const SalesOverviewPage: NextPage = () => {
  return (
    <AdminPageWrapper currentView="salesOverview">
      <SalesOverview />
    </AdminPageWrapper>
  );
};

export default SalesOverviewPage;
