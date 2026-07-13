import type { NextPage } from "next";
import { SalesTeamLeadLayout } from "../../src/portals/manager/SalesTeamLeadLayout";
import { AppsToolsViewer } from "../../src/components/AppsToolsViewer";

const ManagerAppsToolsPage: NextPage = () => {
  return (
    <SalesTeamLeadLayout currentView="apps-tools">
      <div className="page-header">
        <h1 className="page-title">Apps & Tools</h1>
      </div>
      <AppsToolsViewer portal="manager" />
    </SalesTeamLeadLayout>
  );
};

export default ManagerAppsToolsPage;
