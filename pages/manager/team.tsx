import type { NextPage } from "next";
import { useEffect, useState } from "react";
import { ManagerLayout } from "../../src/portals/manager/ManagerLayout";
import { TeamPage } from "../../src/portals/manager/TeamPage";
import { UserProfile } from "../../src/types";

const TeamPageRoute: NextPage = () => {
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const usersRes = await fetch("/api/users");
        if (usersRes.ok) {
          const users = await usersRes.json();
          setTeamMembers(users.filter((u: UserProfile) => u.role === "sales"));
        }
      } catch (error) {
        console.error("Failed to load team data:", error);
      }
    }
    loadData();
  }, []);

  async function handleTeamMembersChange(members: UserProfile[]) {
    setTeamMembers(members);
    try {
      await fetch("/api/users/bulk", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(members)
      });
    } catch (error) {
      console.error("Failed to update team members:", error);
    }
  }

  return (
    <ManagerLayout currentView="team">
      <TeamPage teamMembers={teamMembers} onTeamMembersChange={handleTeamMembersChange} />
    </ManagerLayout>
  );
};

export default TeamPageRoute;
