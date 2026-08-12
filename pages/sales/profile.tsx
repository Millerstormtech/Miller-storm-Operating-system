import type { NextPage } from "next";
import { useEffect, useState } from "react";
import { SalesLayout } from "../../src/portals/sales/SalesLayout";
import { ProfilePage } from "../../src/portals/sales/ProfilePage";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { useAuth } from "../../src/contexts/AuthContext";
import { UserProfile } from "../../src/types";

const Profile: NextPage = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  // Read-only names shown on the profile: the rep's Sales Team Lead (by
  // managerId) and their Branch Manager (the branch-manager on their branch).
  const [teamLeadName, setTeamLeadName] = useState("");
  const [branchManagerName, setBranchManagerName] = useState("");

  useEffect(() => {
    async function loadUserProfile() {
      if (!user?.id) return;

      try {
        const userRes = await fetch(`/api/users/${user.id}`);
        if (userRes.ok) {
          const userProfile = await userRes.json();
          setProfile(userProfile);

          // Resolve the team lead + branch manager names from the org chart
          // (available to any authed user; only non-sensitive fields).
          try {
            const orgRes = await fetch("/api/org-chart");
            if (orgRes.ok) {
              const users = await orgRes.json();
              const lead = users.find((u: any) => u.id === userProfile.managerId);
              setTeamLeadName(lead?.name || "");
              const branch = String(userProfile.territory || "").trim().toLowerCase();
              const bm = users.find(
                (u: any) =>
                  (u.role === "branch-manager" || (u.roles || []).includes("branch-manager")) &&
                  String(u.territory || "").trim().toLowerCase() === branch
              );
              setBranchManagerName(bm?.name || "");
            }
          } catch { /* names are best-effort */ }
        }
      } catch (error) {
        console.error("Failed to load user profile:", error);
      }
    }
    loadUserProfile();
  }, [user?.id]);

  async function handleProfileChange(updatedProfile: UserProfile) {
    setProfile(updatedProfile);
    try {
      await fetch(`/api/users/${updatedProfile.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedProfile)
      });
    } catch (error) {
      console.error("Failed to update profile:", error);
    }
  }

  if (!profile || !user) {
    return <div>Loading...</div>;
  }

  return (
    <ProtectedRoute allowedRoles={["sales"]}>
      <SalesLayout currentView="profile" userName={user.name} userId={user.id} pageSubtitle="How you appear across Miller Storm">
        <ProfilePage
          profile={profile}
          onProfileChange={handleProfileChange}
          teamLeadName={teamLeadName}
          branchManagerName={branchManagerName}
        />
      </SalesLayout>
    </ProtectedRoute>
  );
};

export default Profile;
