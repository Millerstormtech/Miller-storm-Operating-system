import type { NextPage } from "next";
import { CLevelLayout } from "../../src/portals/c-level/CLevelLayout";
import { AppsToolManagement } from "../../src/portals/admin/AppsToolsDynamic";

const CLevelAppsToolsPage: NextPage = () => {
  return (
    <CLevelLayout currentView="apps-tools">
      <AppsToolManagement />
    </CLevelLayout>
  );
};

export default CLevelAppsToolsPage;
