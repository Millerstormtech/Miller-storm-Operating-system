import type { NextPage } from "next";
import { ManagerLayout } from "../../src/portals/manager/ManagerLayout";
import { StormChatViewer } from "../../src/components/StormChatViewer";
import { useAuth } from "../../src/contexts/AuthContext";

const StormChatPage: NextPage = () => {
  const { user } = useAuth();
  if (!user) return <div>Loading...</div>;
  return (
    <ManagerLayout currentView="storm-chat">
      <StormChatViewer />
    </ManagerLayout>
  );
};

export default StormChatPage;
