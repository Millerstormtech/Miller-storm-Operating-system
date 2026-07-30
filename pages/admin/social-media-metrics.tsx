import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { SocialMediaMetrics } from "../../src/portals/admin/SocialMediaMetrics";

const SocialMediaMetricsPage: NextPage = () => {
  return (
    <AdminPageWrapper currentView="socialMediaMetrics" pageTitle="Social Media Metrics">
      <SocialMediaMetrics />
    </AdminPageWrapper>
  );
};

export default SocialMediaMetricsPage;
