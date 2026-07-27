import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { TicketTable } from "../../src/portals/admin/TicketTable";

const TicketsPage: NextPage = () => {
  return (
    <AdminPageWrapper currentView="tickets" pageTitle="Support Tickets">
      <TicketTable />
    </AdminPageWrapper>
  );
};

export default TicketsPage;
