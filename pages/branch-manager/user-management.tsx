import type { NextPage } from "next";
import { BranchManagerLayout } from "../../src/portals/branch-manager/BranchManagerLayout";
import { UserManagementView } from "../../src/portals/admin/UserManagementView";

const BranchManagerUserManagementPage: NextPage = () => (
  <BranchManagerLayout currentView="user-management">
    <UserManagementView />
  </BranchManagerLayout>
);

export default BranchManagerUserManagementPage;
