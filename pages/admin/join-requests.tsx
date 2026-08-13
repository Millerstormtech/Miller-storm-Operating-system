import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { JoinRequests } from "../../src/portals/admin/JoinRequests";

const JoinRequestsPage: NextPage = () => (
  <AdminPageWrapper currentView="stormChat" pageTitle="">
    <div style={{ padding: 24 }}>
      <JoinRequests />
    </div>
  </AdminPageWrapper>
);

export default JoinRequestsPage;
