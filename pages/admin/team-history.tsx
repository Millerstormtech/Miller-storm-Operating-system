import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { TeamHistory } from "../../src/portals/admin/TeamHistory";

const TeamHistoryPage: NextPage = () => (
  <AdminPageWrapper
    currentView="teamHistory"
    pageTitle="Team History"
    pageSubtitle="Who was on which team, and when. Numbers count toward the team a rep was on the day they happened."
  >
    <TeamHistory />
  </AdminPageWrapper>
);

export default TeamHistoryPage;
