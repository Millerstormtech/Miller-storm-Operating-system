import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";

const MaterialsLibraryPage: NextPage = () => {
  return (
    <AdminPageWrapper currentView="materialsLibrary">
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
    </AdminPageWrapper>
  );
};

{/*
import type { NextPage } from "next";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { MaterialsLibrary } from "../../src/portals/admin/MaterialsLibrary";

const MaterialsLibraryPage: NextPage = () => {
  return (
    <AdminPageWrapper currentView="materialsLibrary">
      <MaterialsLibrary />
    </AdminPageWrapper>
  );
};
*/}

export default MaterialsLibraryPage;
