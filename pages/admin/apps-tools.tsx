import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { AppsToolManagement } from "../../src/portals/admin/AppsToolsDynamic";

const AppsToolsPage: NextPage = () => {
  return (
    <AdminPageWrapper currentView="appsTools">
      <AppsToolManagement />
    </AdminPageWrapper>
  );
};

export default AppsToolsPage;
