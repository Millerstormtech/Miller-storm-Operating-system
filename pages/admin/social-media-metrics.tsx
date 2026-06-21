import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { SocialMediaMetrics } from "../../src/portals/admin/SocialMediaMetrics";

const SocialMediaMetricsPage: NextPage = () => {
  return (
    <AdminPageWrapper currentView="socialMediaMetrics">
      <SocialMediaMetrics />
    </AdminPageWrapper>
  );
};

export default SocialMediaMetricsPage;
