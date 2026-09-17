import type { NextPage } from "next";
import { SalesTeamLeadLayout } from "../../src/portals/manager/SalesTeamLeadLayout";
import { CanvassMap } from "../../src/portals/shared/canvass-map/CanvassMap";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { useAuth } from "../../src/contexts/AuthContext";

// Thin route shell for the sales-team-lead role (its screens live in the
// "manager" folders). The screen itself is shared: src/portals/shared/canvass-map/.
const CanvassMapPage: NextPage = () => {
  const { user } = useAuth();

  if (!user) {
    return (
      <SalesTeamLeadLayout currentView="canvass-map">
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "400px" }}>
          <div style={{ textAlign: "center" }}>
            <div className="spinner" style={{ margin: "0 auto 16px" }} />
            <div style={{ color: "var(--text-muted)" }}>Checking session...</div>
          </div>
        </div>
      </SalesTeamLeadLayout>
    );
  }

  return (
    <ProtectedRoute allowedRoles={["sales-team-lead"]}>
      <SalesTeamLeadLayout currentView="canvass-map">
        <CanvassMap />
      </SalesTeamLeadLayout>
    </ProtectedRoute>
  );
};

export default CanvassMapPage;
