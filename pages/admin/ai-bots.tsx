import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { AiBotBuilder } from "../../src/portals/admin/AiBotBuilder";

const AIBotsPage: NextPage = () => {
  return (
    <AdminPageWrapper currentView="aiBots">
      <AiBotBuilder />
    </AdminPageWrapper>
  );
};

export default AIBotsPage;
