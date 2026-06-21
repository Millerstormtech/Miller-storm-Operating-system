import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { UserProfile } from "../../types";

export function TeamPage(props: {
  teamMembers: UserProfile[];
  onTeamMembersChange: (members: UserProfile[]) => void;
}) {
  const router = useRouter();
  const [profiles, setProfiles] = useState<UserProfile[]>(props.teamMembers);
  const [search, setSearch] = useState("");

  const filteredProfiles = profiles.filter((member) => {
    const term = search.toLowerCase().trim();
    if (!term) {
      return true;
    }
    const name = member.name.toLowerCase();
    const territory = (member.territory ?? "").toLowerCase();
    const role = member.role.toLowerCase();
    return (
      name.includes(term) ||
      territory.includes(term) ||
      role.includes(term)
    );
  });

  useEffect(() => {
    setProfiles(props.teamMembers);
  }, [props.teamMembers]);

  function handleUserClick(userId: string) {
    router.push(`/manager/team/${userId}`);
  }

  return (
    <div className="admin-user-management">
      <div className="panel panel-left" style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}>
        <div className="panel-header">
          <div className="panel-header-row">
            <span>Team Members</span>
            <div className="panel-header-actions">
              <input
                className="field-input"
                placeholder="Search team members"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="panel-body list">
          {filteredProfiles.map((member) => (
            <button
              key={member.id}
              className="list-item"
              onClick={() => handleUserClick(member.id)}
            >
              <div className="list-item-title">{member.name}</div>
              <div className="list-item-subtitle">
                {member.role.toUpperCase()} • {member.territory}
              </div>
            </button>
          ))}
          {filteredProfiles.length === 0 && (
            <div className="panel-empty">No team members match your search.</div>
          )}
        </div>
      </div>
    </div>
  );
}
