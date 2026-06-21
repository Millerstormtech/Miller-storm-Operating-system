import { useState } from "react";
import { DashboardCard } from "../../components/DashboardCard";
import { UserProfile } from "../../types";

export function RoleHierarchyManager(props: {
  users: UserProfile[];
  onUsersChange: (users: UserProfile[]) => void;
}) {
  const ceos = props.users.filter((user) => user.role === "admin");
  const managers = props.users.filter((user) => user.role === "manager");
  const salesReps = props.users.filter((user) => user.role === "sales");
  const totalManagers = managers.length;
  const totalSalesReps = salesReps.length;

  const [draggingUserId, setDraggingUserId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{
    userId: string;
    targetManagerId: string | null;
  } | null>(null);

  const unassignedUsers = props.users.filter(
    (user) =>
      user.role !== "admin" &&
      (user.managerId === undefined || user.managerId === "")
  );

  function getDirectReports(managerId: string) {
    return props.users.filter((user) => user.managerId === managerId);
  }

  function getManagerChain(user: UserProfile): UserProfile[] {
    const chain: UserProfile[] = [];
    let current = user;
    let depth = 0;

    while (current.managerId && depth < 7) {
      const manager = props.users.find((u) => u.id === current.managerId);
      if (!manager) {
        break;
      }
      chain.push(manager);
      current = manager;
      depth += 1;
    }

    return chain;
  }

  function moveUserToManager(userId: string, targetManagerId: string | null) {
    const user = props.users.find((u) => u.id === userId);
    if (!user) {
      return;
    }

    const currentManager = user.managerId
      ? props.users.find((u) => u.id === user.managerId)
      : null;
    const targetManager = targetManagerId
      ? props.users.find((u) => u.id === targetManagerId)
      : null;

    const nextManagerId = targetManagerId ?? undefined;

    if (!currentManager || !targetManager) {
      const next = props.users.map((u) =>
        u.id === user.id
          ? {
              ...u,
              managerId: nextManagerId
            }
          : u
      );
      props.onUsersChange(next);
      return;
    }

    const currentToggles = currentManager.featureToggles;
    const targetToggles = targetManager.featureToggles;

    const togglesThatWouldBeLost: string[] = [];

    Object.keys(currentToggles).forEach((key) => {
      const k = key as keyof typeof currentToggles;
      if (currentToggles[k] && !targetToggles[k]) {
        togglesThatWouldBeLost.push(key);
      }
    });

    if (!togglesThatWouldBeLost.length) {
      const next = props.users.map((u) =>
        u.id === user.id
          ? {
              ...u,
              managerId: nextManagerId
            }
          : u
      );
      props.onUsersChange(next);
      return;
    }

    setPendingMove({ userId, targetManagerId: nextManagerId ?? null });

    const message = [
      `${user.name} may lose access to the following features if moved under ${targetManager?.name}:`,
      "",
      togglesThatWouldBeLost.join(", "),
      "",
      "Do you want to continue?"
    ].join("\n");

    const confirmed = window.confirm(message);

    if (!confirmed) {
      setPendingMove(null);
      return;
    }

    const nextFeatures = { ...user.featureToggles };
    togglesThatWouldBeLost.forEach((key) => {
      const k = key as keyof typeof nextFeatures;
      nextFeatures[k] = false;
    });

    const next = props.users.map((u) =>
      u.id === user.id
        ? {
            ...u,
            managerId: nextManagerId,
            featureToggles: nextFeatures
          }
        : u
    );
    props.onUsersChange(next);
    setPendingMove(null);
  }

  function handleDropOnManager(managerId: string | null) {
    if (!draggingUserId) {
      return;
    }
    moveUserToManager(draggingUserId, managerId);
    setDraggingUserId(null);
  }

  function renderOrgNode(user: UserProfile, depth: number = 0) {
    if (depth >= 7) {
      return null;
    }

    const directReports = getDirectReports(user.id);

    return (
      <div
        key={user.id}
        className="org-node"
        draggable
        onDragStart={() => setDraggingUserId(user.id)}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          handleDropOnManager(user.id);
        }}
      >
        <div className="org-node-card">
          <div className="org-node-name">{user.name}</div>
          <div className="org-node-meta">
            {user.role.toUpperCase()}
            {directReports.length > 0 && ` • ${directReports.length} reports`}
          </div>
        </div>
        {directReports.length > 0 && depth < 6 && (
          <div className="org-node-children">
            {directReports.map((child) => renderOrgNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  const rootNodes =
    ceos.length > 0
      ? ceos
      : managers.filter((manager) => !getManagerChain(manager).length);

  return (
    <div className="role-hierarchy">
      <div className="grid grid-3">
        <DashboardCard title="Total Managers" value={totalManagers.toString()} description="Users with Manager role" />
        <DashboardCard title="Total Sales Reps" value={totalSalesReps.toString()} description="Users with Sales Rep role" />
        <DashboardCard title="Levels Supported" value="7" description="Org depth from top-level" />
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <div className="panel-header-row">
            <span>Org Chart</span>
          </div>
        </div>
        <div className="panel-body">
          {props.users.length === 0 ? (
            <div className="panel-empty">No users available.</div>
          ) : (
            <div className="org-layout">
              <div className="org-chart-column">
                <div className="panel-section-title">Hierarchy</div>
                {rootNodes.length === 0 ? (
                  <div className="panel-empty">
                    No top-level managers. Assign Manager role to users to start
                    building the org chart.
                  </div>
                ) : (
                  <div className="org-tree">
                    {rootNodes.map((root) => renderOrgNode(root, 0))}
                  </div>
                )}
              </div>
              <div className="org-unassigned-column">
                <div className="panel-section-title">
                  Unassigned Users (must be attached to a manager)
                </div>
                {unassignedUsers.length === 0 ? (
                  <div className="panel-empty">
                    All non-admin users are assigned to a manager.
                  </div>
                ) : (
                  <div
                    className="list"
                    onDragOver={(e) => {
                      e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDropOnManager(null);
                    }}
                  >
                    {unassignedUsers.map((user) => (
                      <div
                        key={user.id}
                        className="list-item"
                        draggable
                        onDragStart={() => setDraggingUserId(user.id)}
                      >
                        <div className="list-item-title">{user.name}</div>
                        <div className="list-item-subtitle">
                          {user.role.toUpperCase()} • {user.email}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
