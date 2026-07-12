import type { NextPage } from "next";
import { BranchManagerLayout } from "../../src/portals/branch-manager/BranchManagerLayout";
import { StormChatViewer } from "../../src/components/StormChatViewer";
import { useAuth } from "../../src/contexts/AuthContext";

const BranchManagerStormChatPage: NextPage = () => {
  const { user } = useAuth();
  if (!user) return <div>Loading...</div>;
  return (
    <BranchManagerLayout currentView="storm-chat">
      <StormChatViewer />
    </BranchManagerLayout>
  );
};

export default BranchManagerStormChatPage;
