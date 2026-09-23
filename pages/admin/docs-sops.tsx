import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { DocsAndSops } from "../../src/portals/shared/docs/DocsAndSops";

const AdminDocsSopsPage: NextPage = () => {
  return (
    <AdminPageWrapper
      currentView="docs-sops"
      pageTitle="Docs & SOPs"
      pageSubtitle="Company documents and standard operating procedures — view only, nothing here can be downloaded"
    >
      <DocsAndSops />
    </AdminPageWrapper>
  );
};

export default AdminDocsSopsPage;
