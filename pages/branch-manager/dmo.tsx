import type { NextPage } from "next";
import { BranchManagerLayout } from "../../src/portals/branch-manager/BranchManagerLayout";
import { DmoPage } from "../../src/portals/shared/dmo/DmoPage";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { useAuth } from "../../src/contexts/AuthContext";

const DmoRoutePage: NextPage = () => {
  const { user } = useAuth();

  // Session still resolving (AuthContext hasn't returned a user yet): show a
  // bare loading state, same as before. ProtectedRoute below only mounts once
  // a user exists, so this check has to stay outside it.
  if (!user) {
    return (
      <BranchManagerLayout currentView="dmo">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }} />
            <div style={{ color: 'var(--text-muted)' }}>Checking session...</div>
          </div>
        </div>
      </BranchManagerLayout>
    );
  }

  return (
    <ProtectedRoute allowedRoles={["branch-manager"]}>
      <BranchManagerLayout currentView="dmo">
        <DmoPage />
      </BranchManagerLayout>
    </ProtectedRoute>
  );
};

export default DmoRoutePage;
