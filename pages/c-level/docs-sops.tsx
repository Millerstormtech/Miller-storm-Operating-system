import type { NextPage } from "next";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { CLevelLayout } from "../../src/portals/c-level/CLevelLayout";
import { DocsAndSops } from "../../src/portals/shared/docs/DocsAndSops";

const CLevelDocsSopsPage: NextPage = () => {
  return (
    <ProtectedRoute allowedRoles={["c-level"]}>
      <CLevelLayout currentView="docs-sops">
        <DocsAndSops />
      </CLevelLayout>
    </ProtectedRoute>
  );
};

export default CLevelDocsSopsPage;
