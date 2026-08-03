import type { NextPage } from "next";
import { SalesLayout } from "../../src/portals/sales/SalesLayout";
import { MyTasks } from "../../src/portals/shared/MyTasks/MyTasks";
import { useAuth } from "../../src/contexts/AuthContext";

const SalesMyTasksPage: NextPage = () => {
  const { user } = useAuth();
  if (!user) return <div>Loading...</div>;
  return (
    <SalesLayout currentView="my-tasks" userName={user.name} userId={user.id}>
      <MyTasks />
    </SalesLayout>
  );
};

export default SalesMyTasksPage;
