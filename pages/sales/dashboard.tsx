import type { NextPage } from "next";
import { useEffect, useState } from "react";
import { SalesLayout } from "../../src/portals/sales/SalesLayout";
import { SalesDashboard } from "../../src/portals/sales/Dashboard";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { useAuth } from "../../src/contexts/AuthContext";
import { UserProfile } from "../../src/types";

const DashboardPage: NextPage = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    async function loadUserProfile() {
      try {
        const [userRes, planRes] = await Promise.all([
          fetch(`/api/users/${user!.id}`),
          fetch(`/api/business-plan?userId=${user!.id}`)
        ]);

        if (!userRes.ok) { setLoadError(true); return; }

        const userProfile = await userRes.json();

        if (planRes.ok) {
          const plansData = await planRes.json();
          const userPlan = plansData.find((p: any) => p.userId === user!.id);
          if (userPlan?.businessPlan) {
            userProfile.businessPlan = userPlan.businessPlan;
          }
        }

        setProfile(userProfile);
      } catch (error) {
        console.error("Failed to load user profile:", error);
        setLoadError(true);
      }
    }

    loadUserProfile();
  }, [user?.id]);

  if (!user) {
    return (
      <SalesLayout currentView="dashboard">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }} />
            <div style={{ color: '#6b7280' }}>Checking session...</div>
          </div>
        </div>
      </SalesLayout>
    );
  }

  if (loadError) {
    return (
      <SalesLayout currentView="dashboard" userName={user.name} userId={user.id}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <div style={{ color: '#374151', fontWeight: 600, marginBottom: 8 }}>Failed to load dashboard</div>
            <button className="btn-primary" onClick={() => { setLoadError(false); setProfile(null); }}>Retry</button>
          </div>
        </div>
      </SalesLayout>
    );
  }

  if (!profile) {
    return (
      <SalesLayout currentView="dashboard" userName={user.name} userId={user.id}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }} />
            <div style={{ color: '#6b7280' }}>Loading dashboard...</div>
          </div>
        </div>
      </SalesLayout>
    );
  }

  return (
    <ProtectedRoute allowedRoles={["sales"]}>
      <SalesLayout currentView="dashboard" userName={user.name} userId={user.id}>
        <SalesDashboard profile={profile} />
      </SalesLayout>
    </ProtectedRoute>
  );
};

export default DashboardPage;
