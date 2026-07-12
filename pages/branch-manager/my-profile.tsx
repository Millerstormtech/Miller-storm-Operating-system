import type { NextPage } from "next";
import { useEffect, useState } from "react";
import { BranchManagerLayout } from "../../src/portals/branch-manager/BranchManagerLayout";
import { ManagerProfilePage } from "../../src/portals/manager/ManagerProfilePage";
import { useAuth } from "../../src/contexts/AuthContext";
import { UserProfile } from "../../src/types";

const BranchManagerProfilePage: NextPage = () => {
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

  if (!profile || !user) {
    return (
      <BranchManagerLayout currentView="my-profile">
        <div style={{ padding: 24, textAlign: "center" }}>Loading...</div>
      </BranchManagerLayout>
    );
  }

  return (
    <BranchManagerLayout currentView="my-profile">
      <ManagerProfilePage profile={profile} onProfileChange={handleProfileChange} />
    </BranchManagerLayout>
  );
};

export default BranchManagerProfilePage;
