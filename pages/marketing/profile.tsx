import type { NextPage } from "next";
import { useEffect, useState } from "react";
import { MarketingLayout } from "../../src/portals/marketing/MarketingLayout";
import { ProfilePage } from "../../src/portals/sales/ProfilePage";
import { ProtectedRoute } from "../../src/components/ProtectedRoute";
import { useAuth } from "../../src/contexts/AuthContext";
import { UserProfile } from "../../src/types";

const MarketingProfile: NextPage = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    async function loadUserProfile() {
      if (!user?.id) return;
      try {
        const userRes = await fetch(`/api/users/${user.id}`);
        if (userRes.ok) setProfile(await userRes.json());
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
        body: JSON.stringify(updatedProfile),
      });
    } catch (error) {
      console.error("Failed to update profile:", error);
    }
  }

  if (!profile || !user) return <div>Loading...</div>;

  return (
    <ProtectedRoute allowedRoles={["marketing", "admin"]}>
      <MarketingLayout currentView="profile">
        <ProfilePage profile={profile} onProfileChange={handleProfileChange} />
      </MarketingLayout>
    </ProtectedRoute>
  );
};

export default MarketingProfile;
