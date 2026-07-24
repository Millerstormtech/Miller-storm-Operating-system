import type { NextPage } from "next";
import { BranchManagerLayout } from "../../src/portals/branch-manager/BranchManagerLayout";
import { AppsToolManagement } from "../../src/portals/admin/AppsToolsDynamic";

const BranchManagerAppsToolsPage: NextPage = () => {
  return (
    <BranchManagerLayout currentView="apps-tools">
      <AppsToolManagement />
    </BranchManagerLayout>
  );
};

export default BranchManagerAppsToolsPage;
