import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { StormChatManagement } from "../../src/portals/admin/StormChat";

const StormChatPage: NextPage = () => {
  return (
    <AdminPageWrapper currentView="stormChat">
      <StormChatManagement />
    </AdminPageWrapper>
  );
};

export default StormChatPage;
