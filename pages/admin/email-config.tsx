import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { EmailConfig } from "../../src/portals/admin/EmailConfig";

const EmailConfigPage: NextPage = () => {
  return (
    <AdminPageWrapper currentView="emailConfig">
      <EmailConfig />
    </AdminPageWrapper>
  );
};

export default EmailConfigPage;
