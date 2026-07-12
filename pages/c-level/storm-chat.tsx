import type { NextPage } from "next";
import { CLevelLayout } from "../../src/portals/c-level/CLevelLayout";
import { StormChatViewer } from "../../src/components/StormChatViewer";
import { useAuth } from "../../src/contexts/AuthContext";

const CLevelStormChatPage: NextPage = () => {
  const { user } = useAuth();
  if (!user) return <div>Loading...</div>;
  return (
    <CLevelLayout currentView="storm-chat">
      <StormChatViewer />
    </CLevelLayout>
  );
};

export default CLevelStormChatPage;
