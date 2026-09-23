// pages/manager/docs-sops.tsx
import type { NextPage } from "next";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { SalesTeamLeadLayout } from "../../src/portals/manager/SalesTeamLeadLayout";
import { DocsAndSops } from "../../src/portals/shared/docs/DocsAndSops";

const ManagerDocsSopsPage: NextPage = () => {
  return (
    <ProtectedRoute allowedRoles={["sales-team-lead", "admin"]}>
      <SalesTeamLeadLayout currentView="docs-sops">
        <DocsAndSops />
      </SalesTeamLeadLayout>
    </ProtectedRoute>
  );
};

export default ManagerDocsSopsPage;
