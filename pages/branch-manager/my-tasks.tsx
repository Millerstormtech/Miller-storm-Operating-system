import type { NextPage } from "next";
import { BranchManagerLayout } from "../../src/portals/branch-manager/BranchManagerLayout";
import { MyTasks } from "../../src/portals/shared/MyTasks/MyTasks";

const BranchManagerMyTasksPage: NextPage = () => {
  return (
    <BranchManagerLayout currentView="my-tasks">
      <MyTasks />
    </BranchManagerLayout>
  );
};

export default BranchManagerMyTasksPage;
