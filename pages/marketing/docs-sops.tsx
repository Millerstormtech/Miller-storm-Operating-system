// pages/marketing/docs-sops.tsx
import type { NextPage } from "next";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { MarketingLayout } from "../../src/portals/marketing/MarketingLayout";
import { DocsAndSops } from "../../src/portals/shared/docs/DocsAndSops";

const MarketingDocsSopsPage: NextPage = () => {
  return (
    <ProtectedRoute allowedRoles={["marketing", "admin"]}>
      <MarketingLayout currentView="docs-sops">
        <DocsAndSops />
      </MarketingLayout>
    </ProtectedRoute>
  );
};

export default MarketingDocsSopsPage;
