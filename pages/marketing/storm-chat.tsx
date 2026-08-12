import type { NextPage } from "next";
import { MarketingLayout } from "../../src/portals/marketing/MarketingLayout";
import { StormChatViewer } from "../../src/components/StormChatViewer";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { useAuth } from "../../src/contexts/AuthContext";

const MarketingStormChatPage: NextPage = () => {
  const { user } = useAuth();
  if (!user) return <div>Loading...</div>;
  return (
    <ProtectedRoute allowedRoles={["marketing", "admin"]}>
      <MarketingLayout currentView="storm-chat" pageTitle="">
        <StormChatViewer />
      </MarketingLayout>
    </ProtectedRoute>
  );
};

export default MarketingStormChatPage;
