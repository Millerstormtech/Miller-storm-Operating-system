import type { NextPage } from "next";
import { BranchManagerLayout } from "../../src/portals/branch-manager/BranchManagerLayout";
import { AppsToolManagement } from "../../src/portals/admin/AppsToolsDynamic";

const BranchManagerAppsToolsPage: NextPage = () => {
  return (
    <BranchManagerLayout currentView="apps-tools">
      <div className="page-header">
        <h1 className="page-title">Apps & Tools Builder</h1>
      </div>
      <AppsToolManagement />
    </BranchManagerLayout>
  );
};

export default BranchManagerAppsToolsPage;
