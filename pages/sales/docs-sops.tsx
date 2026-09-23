// pages/sales/docs-sops.tsx
import type { NextPage } from "next";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { SalesLayout } from "../../src/portals/sales/SalesLayout";
import { DocsAndSops } from "../../src/portals/shared/docs/DocsAndSops";
import { useAuth } from "../../src/contexts/AuthContext";

const DocsSopsPage: NextPage = () => {
  const { user } = useAuth();
  return (
    <ProtectedRoute allowedRoles={["sales", "sales-team-lead", "admin"]}>
      <SalesLayout currentView="docs-sops" userName={user?.name} userId={user?.id}>
        <DocsAndSops />
      </SalesLayout>
    </ProtectedRoute>
  );
};

export default DocsSopsPage;
