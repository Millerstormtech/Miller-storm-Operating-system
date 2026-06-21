import type { NextPage } from "next";
import { MarketingLayout } from "../../src/portals/marketing/MarketingLayout";
import { Placeholder } from "../../src/portals/marketing/Placeholder";

const TrainingPage: NextPage = () => {
  return (
    <MarketingLayout currentView="training">
      <Placeholder
        title="Marketing Training Center"
        description="Courses and resources for marketing team members."
      />
    </MarketingLayout>
  );
};

export default TrainingPage;
