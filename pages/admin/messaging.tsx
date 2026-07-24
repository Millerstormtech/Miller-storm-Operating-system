import type { NextPage } from "next";
import { AdminLayout } from "../../src/portals/admin/AdminLayout";
import { Messaging } from "../../src/portals/admin/Messaging";

const MessagingPage: NextPage = () => {
  return (
    <AdminLayout currentView="messaging" pageTitle="SMS Configuration">
      <Messaging />
    </AdminLayout>
  );
};

export default MessagingPage;
