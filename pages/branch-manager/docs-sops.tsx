// pages/branch-manager/docs-sops.tsx
import type { NextPage } from "next";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { BranchManagerLayout } from "../../src/portals/branch-manager/BranchManagerLayout";
import { DocsAndSops } from "../../src/portals/shared/docs/DocsAndSops";

const BranchManagerDocsSopsPage: NextPage = () => {
  return (
    <ProtectedRoute allowedRoles={["branch-manager"]}>
      <BranchManagerLayout currentView="docs-sops">
        <DocsAndSops />
      </BranchManagerLayout>
    </ProtectedRoute>
  );
};

export default BranchManagerDocsSopsPage;
