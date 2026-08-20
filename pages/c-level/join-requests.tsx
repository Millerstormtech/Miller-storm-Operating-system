import type { NextPage } from "next";
import { CLevelLayout } from "../../src/portals/c-level/CLevelLayout";
import { JoinRequests } from "../../src/portals/admin/JoinRequests";

const CLevelJoinRequestsPage: NextPage = () => (
  <CLevelLayout currentView="storm-chat" pageTitle="">
    <div style={{ padding: 24 }}>
      <JoinRequests backPath="/c-level/storm-chat" />
    </div>
  </CLevelLayout>
);

export default CLevelJoinRequestsPage;
