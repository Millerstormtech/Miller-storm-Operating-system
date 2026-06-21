import type { NextPage } from "next";
import { ManagerLayout } from "../../src/portals/manager/ManagerLayout";
import { TeamBusinessPlansPage } from "../../src/portals/manager/TeamBusinessPlans";

const PlansPage: NextPage = () => {
  return (
    <ManagerLayout currentView="plans">
      <TeamBusinessPlansPage />
    </ManagerLayout>
  );
};

export default PlansPage;
