import type { NextPage } from "next";
import { ManagerLayout } from "../../src/portals/manager/ManagerLayout";
import { AppsToolsViewer } from "../../src/components/AppsToolsViewer";

const ManagerAppsToolsPage: NextPage = () => {
  return (
    <ManagerLayout currentView="apps-tools">
      <div className="page-header">
        <h1 className="page-title">Apps & Tools</h1>
      </div>
      <AppsToolsViewer portal="manager" />
    </ManagerLayout>
  );
};

export default ManagerAppsToolsPage;
