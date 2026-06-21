import type { NextPage } from "next";
import { SalesLayout } from "../../src/portals/sales/SalesLayout";
import { AppsToolsViewer } from "../../src/components/AppsToolsViewer";
import { useAuth } from "../../src/contexts/AuthContext";

const SalesAppsToolsPage: NextPage = () => {
  const { user } = useAuth();

  return (
    <SalesLayout currentView="apps-tools" userName={user?.name} userId={user?.id}>
      <div className="page-header">
        <h1 className="page-title">Apps & Tools</h1>
      </div>
      <AppsToolsViewer />
    </SalesLayout>
  );
};

export default SalesAppsToolsPage;
