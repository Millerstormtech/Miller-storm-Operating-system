import type { NextPage } from "next";
import { SalesLayout } from "../../src/portals/sales/SalesLayout";
import { CanvassMap } from "../../src/portals/shared/canvass-map/CanvassMap";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { useAuth } from "../../src/contexts/AuthContext";

// Thin route shell: auth and layout only. The screen lives in
// src/portals/shared/canvass-map/ and is shared by every role.
const CanvassMapPage: NextPage = () => {
  const { user } = useAuth();

  if (!user) {
    return (
      <SalesLayout currentView="canvass-map">
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "400px" }}>
          <div style={{ textAlign: "center" }}>
            <div className="spinner" style={{ margin: "0 auto 16px" }} />
            <div style={{ color: "var(--text-muted)" }}>Checking session...</div>
          </div>
        </div>
      </SalesLayout>
    );
  }

  return (
    <ProtectedRoute allowedRoles={["sales"]}>
      <SalesLayout currentView="canvass-map" userName={user.name} userId={user.id}>
        <CanvassMap />
      </SalesLayout>
    </ProtectedRoute>
  );
};

export default CanvassMapPage;
