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

  useEffect(() => {
    async function loadUserProfile() {
      if (!user?.id) return;
      
      try {
        const userRes = await fetch(`/api/users/${user.id}`);
        if (userRes.ok) {
          const userProfile = await userRes.json();
          setProfile(userProfile);
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
      <SalesLayout currentView="profile" userName={user.name} userId={user.id}>
        <ProfilePage profile={profile} onProfileChange={handleProfileChange} />
      </SalesLayout>
    </ProtectedRoute>
  );
};

export default Profile;
