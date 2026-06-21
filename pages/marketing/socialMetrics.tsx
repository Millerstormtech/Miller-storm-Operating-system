import type { NextPage } from "next";
import { MarketingLayout } from "../../src/portals/marketing/MarketingLayout";
import { Placeholder } from "../../src/portals/marketing/Placeholder";

const SocialMetricsPage: NextPage = () => {
  return (
    <MarketingLayout currentView="socialMetrics">
      <Placeholder
        title="Social Metrics Dashboard"
        description="High-level social media performance placeholders."
      />
    </MarketingLayout>
  );
};

export default SocialMetricsPage;
