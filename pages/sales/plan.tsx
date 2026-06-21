import type { NextPage } from "next";
import { useEffect, useState } from "react";
import { SalesLayout } from "../../src/portals/sales/SalesLayout";
import { BusinessPlanPage } from "../../src/portals/sales/BusinessPlanPage";
import { useAuth } from "../../src/contexts/AuthContext";
import { UserProfile } from "../../src/types";

const Plan: NextPage = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    async function loadUserProfile() {
      if (!user?.id) {
        console.log('⚠️ No user ID available');
        return;
      }
      
      console.log('🔍 Loading user profile for ID:', user.id);
      
      try {
        const userRes = await fetch(`/api/users/${user.id}`);
        console.log('📡 User API response status:', userRes.status);
        
        if (userRes.ok) {
          const userProfile = await userRes.json();
          console.log('✅ Loaded user profile:', { id: userProfile.id, name: userProfile.name, email: userProfile.email });
          setProfile(userProfile);
        } else {
          const errorData = await userRes.json();
          console.error('❌ Failed to load user profile:', errorData);
        }
      } catch (error) {
        console.error("❌ Failed to load user profile:", error);
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
    <SalesLayout currentView="plan" userName={user.name} userId={user.id}>
      <BusinessPlanPage profile={profile} onProfileChange={handleProfileChange} />
    </SalesLayout>
  );
};

export default Plan;
