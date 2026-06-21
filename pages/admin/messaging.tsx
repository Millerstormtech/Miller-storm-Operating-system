import type { NextPage } from "next";
import { AdminLayout } from "../../src/portals/admin/AdminLayout";
import { Messaging } from "../../src/portals/admin/Messaging";

const MessagingPage: NextPage = () => {
  return (
    <AdminLayout currentView="messaging">
      <div className="page-header">
        <h1 className="page-title">SMS Configuration</h1>
      </div>
      <Messaging />
    </AdminLayout>
  );
};

export default MessagingPage;
