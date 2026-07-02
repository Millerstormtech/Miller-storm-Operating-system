import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";

type OrgUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  roles?: string[];
  managerId?: string;
  headshotUrl?: string;
};

const ROLE: Record<string, { label: string; bg: string; border: string; text: string; dot: string }> = {
  admin: { label: "Admin", bg: "#fef2f2", border: "#fecaca", text: "#b91c1c", dot: "#dc2626" },
  manager: { label: "Manager", bg: "#f5f3ff", border: "#ddd6fe", text: "#6d28d9", dot: "#7c3aed" },
  sales: { label: "Sales", bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8", dot: "#2563eb" },
  marketing: { label: "Marketing", bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d", dot: "#16a34a" },
};

function roleOf(u: OrgUser): string {
  const r = (u.role || "").toLowerCase();
  if (ROLE[r]) return r;
  const list = (u.roles || []).map((x) => x.toLowerCase());
  return list.find((x) => ROLE[x]) || "sales";
}

function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/);
  if (!parts[0]) return "?";
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toUpperCase();
}

function Avatar({ user, size = 40 }: { user: OrgUser; size?: number }) {
  const c = ROLE[roleOf(user)];
  if (user.headshotUrl) {
    return (
      <img
        src={user.headshotUrl}
        alt={user.name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: `2px solid ${c.border}` }}
      />
    );
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        background: c.bg, color: c.text, border: `2px solid ${c.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 700, fontSize: size * 0.36,
      }}
    >
      {initials(user.name)}
    </div>
  );
}

// A single compact org-chart node (avatar on top, name, role badge).
function Node({ user, isYou }: { user: OrgUser; isYou: boolean }) {
  const c = ROLE[roleOf(user)];
  return (
    <div className="node" style={{ borderTop: `3px solid ${c.dot}`, boxShadow: isYou ? `0 0 0 2px ${c.dot}` : undefined }}>
      <Avatar user={user} size={42} />
      <div className="node-name" title={user.name}>
        {user.name}
        {isYou && <span className="you-badge" style={{ color: c.text, background: c.bg }}>YOU</span>}
      </div>
      <span className="node-role" style={{ color: c.text, background: c.bg }}>{c.label}</span>
      <div className="node-email" title={user.email}>{user.email}</div>
    </div>
  );
}

export function TeamStructure() {
  const { user } = useAuth();
  const [users, setUsers] = useState<OrgUser[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/org-chart")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => active && setUsers(data))
      .catch(() => active && setError(true));
    return () => { active = false; };
  }, []);

  const { admins, managers, marketing, unassigned, counts } = useMemo(() => {
    const all = users || [];
    const q = query.trim().toLowerCase();
    const match = (u: OrgUser) => !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);

    const byRole = (role: string) => all.filter((u) => roleOf(u) === role);
    const adminList = byRole("admin");
    const managerList = byRole("manager");
    const sales = byRole("sales");
    const marketingList = byRole("marketing");

    const repsByManager = new Map<string, OrgUser[]>();
    const noManager: OrgUser[] = [];
    for (const s of sales) {
      if (s.managerId && managerList.some((m) => m.id === s.managerId)) {
        const arr = repsByManager.get(s.managerId) || [];
        arr.push(s);
        repsByManager.set(s.managerId, arr);
      } else {
        noManager.push(s);
      }
    }

    const managers = managerList
      .map((m) => ({ manager: m, reps: (repsByManager.get(m.id) || []).filter(match), self: match(m) }))
      .filter(({ self, reps }) => self || reps.length > 0);

    return {
      admins: adminList.filter(match),
      managers,
      marketing: marketingList.filter(match),
      unassigned: noManager.filter(match),
      counts: { admins: adminList.length, managers: managerList.length, sales: sales.length, marketing: marketingList.length },
    };
  }, [users, query]);

  if (error) return <div style={{ padding: 40, color: "#6b7280" }}>Couldn&apos;t load the team structure. Please try again.</div>;
  if (!users) return <div style={{ padding: 40, color: "#6b7280" }}>Loading team structure…</div>;

  const stat = (label: string, n: number, color: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "8px 14px" }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: color }} />
      <span style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{n}</span>
      <span style={{ fontSize: 12.5, color: "#6b7280" }}>{label}</span>
    </div>
  );

  const nothing = admins.length === 0 && managers.length === 0 && marketing.length === 0 && unassigned.length === 0;

  return (
    <div>
      {/* Summary */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        {stat("Admins", counts.admins, ROLE.admin.dot)}
        {stat("Managers", counts.managers, ROLE.manager.dot)}
        {stat("Sales", counts.sales, ROLE.sales.dot)}
        {stat("Marketing", counts.marketing, ROLE.marketing.dot)}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or email…"
        style={{ width: "100%", maxWidth: 360, padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 14, marginBottom: 22, outline: "none" }}
      />

      {nothing ? (
        <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>No matching people.</div>
      ) : (
        <div className="chart-scroll">
          <div className="tree">
            {/* Tier 1: Admins */}
            {admins.length > 0 && (
              <div className="admin-row">
                {admins.map((a) => <Node key={a.id} user={a} isYou={a.id === user?.id} />)}
              </div>
            )}

            {/* connector from admins down to the managers bus */}
            {admins.length > 0 && managers.length > 0 && <div className="trunk" />}

            {/* Tier 2 + 3: Managers with their reps */}
            {managers.length > 0 && (
              <ul className="branch">
                {managers.map(({ manager, reps }) => (
                  <li key={manager.id}>
                    <Node user={manager} isYou={manager.id === user?.id} />
                    {reps.length > 0 && (
                      <ul>
                        {reps.map((r) => (
                          <li key={r.id}>
                            <Node user={r} isYou={r.id === user?.id} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Marketing + unassigned shown as rows below the chart */}
      {(marketing.length > 0 || unassigned.length > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 32, marginTop: 28 }}>
          {marketing.length > 0 && (
            <div>
              <div className="side-title" style={{ color: ROLE.marketing.text }}>Marketing · {marketing.length}</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {marketing.map((m) => <Node key={m.id} user={m} isYou={m.id === user?.id} />)}
              </div>
            </div>
          )}
          {unassigned.length > 0 && (
            <div>
              <div className="side-title" style={{ color: ROLE.sales.text }}>Sales · Unassigned · {unassigned.length}</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {unassigned.map((s) => <Node key={s.id} user={s} isYou={s.id === user?.id} />)}
              </div>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .chart-scroll { overflow-x: auto; padding: 8px 0 12px; }
        .tree { display: inline-flex; flex-direction: column; align-items: center; min-width: 100%; }
        .admin-row { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
        .trunk { width: 2px; height: 26px; background: #d7dbe0; }

        /* Recursive org-chart connectors (managers -> reps) */
        .branch, .branch ul { display: flex; justify-content: center; margin: 0; padding: 0; list-style: none; position: relative; }
        .branch ul { padding-top: 26px; }
        .branch li {
          position: relative; padding: 26px 12px 0;
          display: flex; flex-direction: column; align-items: center;
        }
        /* vertical + horizontal connectors above each child */
        .branch li::before, .branch li::after {
          content: ""; position: absolute; top: 0; right: 50%;
          border-top: 2px solid #d7dbe0; width: 50%; height: 26px;
        }
        .branch li::after { right: auto; left: 50%; border-left: 2px solid #d7dbe0; }
        .branch li:only-child::before, .branch li:only-child::after { display: none; }
        .branch li:only-child { padding-top: 26px; }
        .branch li:first-child::before, .branch li:last-child::after { border: 0 none; }
        .branch li:last-child::before { border-right: 2px solid #d7dbe0; }
        .branch li:first-child::after { border-left: 2px solid #d7dbe0; }
        /* vertical line from a parent node down to its children row */
        .branch ul::before {
          content: ""; position: absolute; top: 0; left: 50%;
          border-left: 2px solid #d7dbe0; width: 0; height: 26px;
        }

        .side-title { font-size: 13px; font-weight: 700; margin-bottom: 12px; }
      `}</style>

      {/* Node styling (global so nested elements pick it up) */}
      <style jsx global>{`
        .node {
          width: 168px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
          padding: 12px 10px 10px; display: flex; flex-direction: column; align-items: center;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05); text-align: center;
        }
        .node-name {
          margin-top: 8px; font-size: 13.5px; font-weight: 600; color: #111827;
          max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          display: flex; align-items: center; gap: 5px; justify-content: center;
        }
        .you-badge { font-size: 9px; font-weight: 700; border-radius: 5px; padding: 1px 5px; }
        .node-role { margin-top: 5px; font-size: 11px; font-weight: 700; border-radius: 999px; padding: 2px 9px; }
        .node-email {
          margin-top: 6px; font-size: 10.5px; color: #9ca3af;
          max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
