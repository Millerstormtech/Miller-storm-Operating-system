import type { NextPage } from "next";
import { SalesLayout } from "../../src/portals/sales/SalesLayout";
import { useAuth } from "../../src/contexts/AuthContext";

const WebPage: NextPage = () => {
  const { user } = useAuth();

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <SalesLayout currentView="webPage" userName={user.name} userId={user.id}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        textAlign: 'center'
      }}>
        <h1 style={{ fontSize: '48px', marginBottom: '16px', color: '#6b7280' }}>🚧</h1>
        <h2 style={{ fontSize: '32px', fontWeight: '600', marginBottom: '8px' }}>Coming Soon</h2>
        <p style={{ fontSize: '16px', color: '#6b7280' }}>This feature is under development</p>
      </div>
    </SalesLayout>
  );
};

{/*
import type { NextPage } from "next";
import { useEffect, useState } from "react";
import { SalesLayout } from "../../src/portals/sales/SalesLayout";
import { WebPagePreview } from "../../src/portals/sales/WebPagePreview";
import { useAuth } from "../../src/contexts/AuthContext";
import { UserProfile } from "../../src/types";

const WebPage: NextPage = () => {
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
    <SalesLayout currentView="webPage" userName={user.name} userId={user.id}>
      <WebPagePreview profile={profile} onProfileChange={handleProfileChange} />
    </SalesLayout>
  );
};
*/}

export default WebPage;
