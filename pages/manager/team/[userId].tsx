import type { NextPage } from "next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { ManagerLayout } from "../../../src/portals/manager/ManagerLayout";
import { TeamMemberDetail } from "../../../src/portals/manager/TeamMemberDetail";
import { UserProfile } from "../../../src/types";

const TeamMemberDetailPage: NextPage = () => {
  const router = useRouter();
  const { userId } = router.query;
  const [member, setMember] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    
    async function loadMember() {
      try {
        const res = await fetch(`/api/users/${userId}`);
        if (res.ok) {
          const data = await res.json();
          setMember(data);
        }
      } catch (error) {
        console.error("Failed to load member:", error);
      } finally {
        setLoading(false);
      }
    }
    
    loadMember();
  }, [userId]);

  async function handleMemberChange(updated: UserProfile) {
    setMember(updated);
    try {
      await fetch(`/api/users/${updated.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated)
      });
    } catch (error) {
      console.error("Failed to update member:", error);
    }
  }

  if (loading) {
    return (
      <ManagerLayout currentView="team">
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '16px', color: '#6b7280' }}>Loading...</div>
        </div>
      </ManagerLayout>
    );
  }

  if (!member) {
    return (
      <ManagerLayout currentView="team">
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '16px', color: '#6b7280' }}>Team member not found</div>
        </div>
      </ManagerLayout>
    );
  }

  return (
    <ManagerLayout currentView="team">
      <TeamMemberDetail member={member} onMemberChange={handleMemberChange} />
    </ManagerLayout>
  );
};

export default TeamMemberDetailPage;
