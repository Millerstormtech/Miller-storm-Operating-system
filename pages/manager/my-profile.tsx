import type { NextPage } from "next";
import { useEffect, useState } from "react";
import { SalesTeamLeadLayout } from "../../src/portals/manager/SalesTeamLeadLayout";
import { SalesTeamLeadProfilePage } from "../../src/portals/manager/SalesTeamLeadProfilePage";
import { useAuth } from "../../src/contexts/AuthContext";
import { UserProfile } from "../../src/types";

const MyProfilePage: NextPage = () => {
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
    return (
      <SalesTeamLeadLayout currentView="my-profile">
        <div style={{ padding: 24, textAlign: 'center' }}>Loading...</div>
      </SalesTeamLeadLayout>
    );
  }

  return (
    <SalesTeamLeadLayout currentView="my-profile">
      <SalesTeamLeadProfilePage profile={profile} onProfileChange={handleProfileChange} />
    </SalesTeamLeadLayout>
  );
};

export default MyProfilePage;
