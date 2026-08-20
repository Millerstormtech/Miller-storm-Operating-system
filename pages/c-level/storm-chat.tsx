import type { NextPage } from "next";
import { CLevelLayout } from "../../src/portals/c-level/CLevelLayout";
import { StormChatManagement } from "../../src/portals/admin/StormChat";

const CLevelStormChatPage: NextPage = () => {
  return (
    <CLevelLayout currentView="storm-chat" pageTitle="">
      <StormChatManagement joinRequestsPath="/c-level/join-requests" />
    </CLevelLayout>
  );
};

export default CLevelStormChatPage;
