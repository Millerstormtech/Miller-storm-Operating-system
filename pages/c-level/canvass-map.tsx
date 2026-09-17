import type { NextPage } from "next";
import { CLevelLayout } from "../../src/portals/c-level/CLevelLayout";
import { CanvassMap } from "../../src/portals/shared/canvass-map/CanvassMap";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { useAuth } from "../../src/contexts/AuthContext";

// Thin route shell: auth and layout only. The screen is shared by every role.
const CanvassMapPage: NextPage = () => {
  const { user } = useAuth();

  if (!user) {
    return (
      <CLevelLayout currentView="canvass-map">
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "400px" }}>
          <div style={{ textAlign: "center" }}>
            <div className="spinner" style={{ margin: "0 auto 16px" }} />
            <div style={{ color: "var(--text-muted)" }}>Checking session...</div>
          </div>
        </div>
      </CLevelLayout>
    );
  }

  return (
    <ProtectedRoute allowedRoles={["c-level"]}>
      <CLevelLayout currentView="canvass-map">
        <CanvassMap />
      </CLevelLayout>
    </ProtectedRoute>
  );
};

export default CanvassMapPage;
