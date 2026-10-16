import type { NextPage } from "next";
import { CLevelLayout } from "../../src/portals/c-level/CLevelLayout";
import { StormChatViewer } from "../../src/components/StormChatViewer";
import { useAuth } from "../../src/contexts/AuthContext";

// C-level uses the same Storm Chat screen as everyone else: under the GroupMe
// model (2026-10-15) a job title gives no chat powers, only group admin rights
// do. Groups they are not in show locked with "Join".
const CLevelStormChatPage: NextPage = () => {
  const { user } = useAuth();
  if (!user) return <div>Loading...</div>;
  return (
    <CLevelLayout currentView="storm-chat" pageTitle="">
      <StormChatViewer />
    </CLevelLayout>
  );
};

export default CLevelStormChatPage;
