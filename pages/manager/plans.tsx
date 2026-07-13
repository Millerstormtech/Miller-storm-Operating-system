import type { NextPage } from "next";
import { SalesTeamLeadLayout } from "../../src/portals/manager/SalesTeamLeadLayout";
import { TeamBusinessPlansPage } from "../../src/portals/manager/TeamBusinessPlans";

const PlansPage: NextPage = () => {
  return (
    <SalesTeamLeadLayout currentView="plans">
      <TeamBusinessPlansPage />
    </SalesTeamLeadLayout>
  );
};

export default PlansPage;
