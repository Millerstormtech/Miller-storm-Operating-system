import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { ApprovalWorkflows } from "../../src/portals/admin/ApprovalWorkflows";

const ApprovalWorkflowsPage: NextPage = () => {
  return (
    <AdminPageWrapper currentView="approvalWorkflows">
      <ApprovalWorkflows />
    </AdminPageWrapper>
  );
};

export default ApprovalWorkflowsPage;
