import type { NextPage } from "next";
import { CLevelLayout } from "../../src/portals/c-level/CLevelLayout";
import { AppsToolManagement } from "../../src/portals/admin/AppsToolsDynamic";

const CLevelAppsToolsPage: NextPage = () => {
  return (
    <CLevelLayout currentView="apps-tools">
      <div className="page-header">
        <h1 className="page-title">Apps & Tools Builder</h1>
      </div>
      <AppsToolManagement />
    </CLevelLayout>
  );
};

export default CLevelAppsToolsPage;
