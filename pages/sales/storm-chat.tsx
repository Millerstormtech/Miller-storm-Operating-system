import type { NextPage } from "next";
import { SalesLayout } from "../../src/portals/sales/SalesLayout";
import { StormChatViewer } from "../../src/components/StormChatViewer";
import { useAuth } from "../../src/contexts/AuthContext";

const StormChatPage: NextPage = () => {
  const { user } = useAuth();
  if (!user) return <div>Loading...</div>;
  return (
    <SalesLayout currentView="storm-chat" userName={user.name} userId={user.id}>
      <StormChatViewer />
    </SalesLayout>
  );
};

export default StormChatPage;
