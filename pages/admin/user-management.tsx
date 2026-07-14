import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { UserManagementView } from "../../src/portals/admin/UserManagementView";

const UserManagementPage: NextPage = () => (
  <AdminPageWrapper currentView="userManagement">
    <UserManagementView />
  </AdminPageWrapper>
);

export default UserManagementPage;
