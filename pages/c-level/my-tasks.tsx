import type { NextPage } from "next";
import { CLevelLayout } from "../../src/portals/c-level/CLevelLayout";
import { MyTasks } from "../../src/portals/shared/MyTasks/MyTasks";

const CLevelMyTasksPage: NextPage = () => {
  return (
    <CLevelLayout currentView="my-tasks">
      <MyTasks />
    </CLevelLayout>
  );
};

export default CLevelMyTasksPage;
