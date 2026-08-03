import type { NextPage } from "next";
import { SalesTeamLeadLayout } from "../../src/portals/manager/SalesTeamLeadLayout";
import { MyTasks } from "../../src/portals/shared/MyTasks/MyTasks";

const SalesTeamLeadMyTasksPage: NextPage = () => {
  return (
    <SalesTeamLeadLayout currentView="my-tasks">
      <MyTasks />
    </SalesTeamLeadLayout>
  );
};

export default SalesTeamLeadMyTasksPage;
