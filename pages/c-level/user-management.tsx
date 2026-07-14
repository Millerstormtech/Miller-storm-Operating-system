import type { NextPage } from "next";
import { CLevelLayout } from "../../src/portals/c-level/CLevelLayout";
import { UserManagementView } from "../../src/portals/admin/UserManagementView";

const CLevelUserManagementPage: NextPage = () => (
  <CLevelLayout currentView="user-management">
    <UserManagementView />
  </CLevelLayout>
);

export default CLevelUserManagementPage;
