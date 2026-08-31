import type { NextPage } from "next";
import { useEffect, useState } from "react";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { SalesTeamLeadProfilePage } from "../../src/portals/manager/SalesTeamLeadProfilePage";
import { useAuth } from "../../src/contexts/AuthContext";
import { UserProfile } from "../../src/types";

// The admin's own profile — same editable card the leaders use (name, phone,
// photo), plus the "Request Account Deletion" option after Save.
const AdminMyProfilePage: NextPage = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      try {
        const res = await fetch(`/api/users/${user.id}`);
        if (res.ok) setProfile(await res.json());
      } catch (error) {
        console.error("Failed to load profile:", error);
      }
    }
    load();
  }, [user?.id]);

  async function handleProfileChange(updated: UserProfile) {
    setProfile(updated);
    try {
      await fetch(`/api/users/${updated.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
    } catch (error) {
      console.error("Failed to update profile:", error);
    }
  }

  return (
    <AdminPageWrapper currentView="myProfile" pageTitle="Profile" pageSubtitle="How you appear across Miller Storm">
      {profile ? (
        <SalesTeamLeadProfilePage profile={profile} onProfileChange={handleProfileChange} />
      ) : (
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
      )}
    </AdminPageWrapper>
  );
};

export default AdminMyProfilePage;
