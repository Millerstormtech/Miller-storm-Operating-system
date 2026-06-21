import type { NextPage } from "next";
import { SalesLayout } from "../../src/portals/sales/SalesLayout";
import { useAuth } from "../../src/contexts/AuthContext";

const Materials: NextPage = () => {
  const { user } = useAuth();

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <SalesLayout currentView="materials" userName={user.name} userId={user.id}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        textAlign: 'center'
      }}>
        <h1 style={{ fontSize: '48px', marginBottom: '16px', color: '#6b7280' }}>🚧</h1>
        <h2 style={{ fontSize: '32px', fontWeight: '600', marginBottom: '8px' }}>Coming Soon</h2>
        <p style={{ fontSize: '16px', color: '#6b7280' }}>This feature is under development</p>
      </div>
    </SalesLayout>
  );
};

{/*
import type { NextPage } from "next";
import { SalesLayout } from "../../src/portals/sales/SalesLayout";
import { MarketingMaterialsViewer } from "../../src/components/MarketingMaterialsViewer";
import { useAuth } from "../../src/contexts/AuthContext";

const Materials: NextPage = () => {
  const { user } = useAuth();

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <SalesLayout currentView="materials" userName={user.name} userId={user.id}>
      <div className="page-header">
        <h1 className="page-title">Marketing Materials</h1>
      </div>
      <MarketingMaterialsViewer />
    </SalesLayout>
  );
};
*/}

export default Materials;
