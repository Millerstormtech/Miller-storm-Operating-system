import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { MyTasks } from "../../src/portals/shared/MyTasks/MyTasks";

const AdminMyTasksPage: NextPage = () => {
  return (
    <AdminPageWrapper currentView="myTasks">
      <MyTasks />
    </AdminPageWrapper>
  );
};

export default AdminMyTasksPage;
