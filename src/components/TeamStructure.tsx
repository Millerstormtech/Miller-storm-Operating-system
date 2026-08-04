import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";

type OrgUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  roles?: string[];
  managerId?: string;
  headshotUrl?: string;
  territory?: string;
};

const ROLE: Record<string, { label: string; bg: string; border: string; text: string; dot: string }> = {
  "c-level": { label: "C-Level", bg: "#eef2ff", border: "#c7d2fe", text: "#4338ca", dot: "#4f46e5" },
  "branch-manager": { label: "Branch Manager", bg: "#fff7ed", border: "#fed7aa", text: "#c2410c", dot: "#ea580c" },
  "sales-team-lead": { label: "Sales Team Lead", bg: "#f5f3ff", border: "#ddd6fe", text: "#6d28d9", dot: "#7c3aed" },
  sales: { label: "Sales", bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8", dot: "#2563eb" },
  marketing: { label: "Marketing", bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d", dot: "#16a34a" },
  admin: { label: "Admin", bg: "#fef2f2", border: "#fecaca", text: "#b91c1c", dot: "#dc2626" },
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

function Avatar({ user, size = 40, role }: { user: OrgUser; size?: number; role?: string }) {
  const c = ROLE[role || roleOf(user)];
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

// A single compact org-chart node (avatar on top, name, role badge). `roleOverride`
// lets a branch manager be re-drawn as their own Sales Team Lead card (the same
// person appears twice in the chart when they also run a team).
function Node({ user, isYou, roleOverride }: { user: OrgUser; isYou: boolean; roleOverride?: string }) {
  const role = roleOverride || roleOf(user);
  const c = ROLE[role];
  return (
    <div className="node" style={{ borderTop: `3px solid ${c.dot}`, boxShadow: isYou ? `0 0 0 2px ${c.dot}` : undefined }}>
      <Avatar user={user} size={42} role={role} />
      <div className="node-name" title={user.name}>
        {user.name}
        {isYou && <span className="you-badge" style={{ color: c.text, background: c.bg }}>YOU</span>}
      </div>
      <span className="node-role" style={{ color: c.text, background: c.bg }}>{c.label}</span>
      <div className="node-email" title={user.email}>{user.email}</div>
    </div>
  );
}

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 1.6;
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));

export function TeamStructure() {
  const { user } = useAuth();
  const [users, setUsers] = useState<OrgUser[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const wheelOff = useRef<(() => void) | null>(null);
  const [hovered, setHovered] = useState(false);
  const drag = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);

  // Callback ref: attach the wheel-zoom listener exactly when the scroll
  // container mounts. (A plain useEffect ran once before the chart existed, so
  // the listener never attached and Ctrl+scroll zoom did nothing.)
  const setScrollEl = useCallback((el: HTMLDivElement | null) => {
    wheelOff.current?.();
    wheelOff.current = null;
    scrollRef.current = el;
    if (!el) return;
    // Plain wheel scrolls/pans the chart (native). Ctrl/⌘ + wheel (and trackpad
    // pinch, reported as ctrl+wheel) zooms ONLY the chart — we scale .tree and
    // preventDefault the browser's page zoom, so the sidebar, page header and
    // stat cards stay fixed.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // plain wheel = scroll/pan
      e.preventDefault();
      setZoom((z) => clampZoom(z + (e.deltaY < 0 ? 0.08 : -0.08)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    wheelOff.current = () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Zoom with the keyboard while hovering the chart: +/- to zoom, 0 to reset.
  useEffect(() => {
    if (!hovered) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "+" || e.key === "=") { e.preventDefault(); setZoom((z) => clampZoom(z + 0.1)); }
      else if (e.key === "-" || e.key === "_") { e.preventDefault(); setZoom((z) => clampZoom(z - 0.1)); }
      else if (e.key === "0") { e.preventDefault(); setZoom(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hovered]);

  // Click-and-drag to pan around the chart (easier than scrollbars).
  function onDragStart(e: React.MouseEvent) {
    const el = scrollRef.current;
    if (!el) return;
    drag.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
    el.style.cursor = "grabbing";
  }
  function onDragMove(e: React.MouseEvent) {
    const el = scrollRef.current;
    if (!el || !drag.current) return;
    el.scrollLeft = drag.current.sl - (e.clientX - drag.current.x);
    el.scrollTop = drag.current.st - (e.clientY - drag.current.y);
  }
  function onDragEnd() {
    const el = scrollRef.current;
    if (el) el.style.cursor = "grab";
    drag.current = null;
  }

  useEffect(() => {
    let active = true;
    fetch("/api/org-chart")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => active && setUsers(data))
      .catch(() => active && setError(true));
    return () => { active = false; };
  }, []);

  const { cLevel, branchTree, orphanLeads, admins, marketing, unassigned, counts } = useMemo(() => {
    const all = users || [];
    const q = query.trim().toLowerCase();
    const match = (u: OrgUser) => !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);

    const byRole = (role: string) => all.filter((u) => roleOf(u) === role);
    const cLevelList = byRole("c-level");
    const branchManagerList = byRole("branch-manager");
    const adminList = byRole("admin");
    const teamLeadList = byRole("sales-team-lead");
    const sales = byRole("sales");
    const marketingList = byRole("marketing");

    const teamLeadIds = new Set(teamLeadList.map((m) => m.id));
    const branchManagerIds = new Set(branchManagerList.map((m) => m.id));

    // Sales reps grouped by whoever they report to (a Sales Team Lead OR, when a
    // branch manager also runs a team directly, a Branch Manager).
    const repsByManager = new Map<string, OrgUser[]>();
    const noManager: OrgUser[] = [];
    for (const s of sales) {
      if (s.managerId && (teamLeadIds.has(s.managerId) || branchManagerIds.has(s.managerId))) {
        const arr = repsByManager.get(s.managerId) || [];
        arr.push(s);
        repsByManager.set(s.managerId, arr);
      } else {
        noManager.push(s);
      }
    }

    // Team leads grouped under their branch manager. A team lead whose managerId
    // is not a branch manager is an "orphan" and gets its own bus below.
    // The branch manager for each branch (territory), so a team lead can be placed
    // under their branch's manager even when managerId was never set on them.
    const branchManagerByTerritory = new Map<string, OrgUser>();
    for (const bm of branchManagerList) {
      const t = (bm.territory || "").trim().toLowerCase();
      if (t && !branchManagerByTerritory.has(t)) branchManagerByTerritory.set(t, bm);
    }

    const teamLeadsByBranch = new Map<string, OrgUser[]>();
    const orphanLeadList: OrgUser[] = [];
    for (const tl of teamLeadList) {
      // Prefer an explicit managerId that points at a branch manager; otherwise
      // fall back to the branch manager who shares this team lead's branch. This
      // keeps every team lead on the SAME row under their branch manager instead
      // of dropping the ones without a managerId into a lower orphan bus.
      let bmId: string | null = null;
      if (tl.managerId && branchManagerIds.has(tl.managerId)) {
        bmId = tl.managerId;
      } else {
        const t = (tl.territory || "").trim().toLowerCase();
        const bm = t ? branchManagerByTerritory.get(t) : undefined;
        if (bm) bmId = bm.id;
      }
      if (bmId) {
        const arr = teamLeadsByBranch.get(bmId) || [];
        arr.push(tl);
        teamLeadsByBranch.set(bmId, arr);
      } else {
        orphanLeadList.push(tl);
      }
    }

    type LeadNode = { key: string; lead: OrgUser; reps: OrgUser[]; asTeamLead: boolean };

    // The team-lead tier under one branch manager: every real team lead, PLUS the
    // branch manager themselves as a second card when they directly run a team.
    // That duplicate is exactly the org chart's "Branch Manager appears twice".
    const leadNodesFor = (bm: OrgUser): LeadNode[] => {
      const nodes: LeadNode[] = [];
      const bmReps = repsByManager.get(bm.id) || [];
      if (bmReps.length > 0) nodes.push({ key: `${bm.id}-as-lead`, lead: bm, reps: bmReps, asTeamLead: true });
      for (const tl of teamLeadsByBranch.get(bm.id) || []) {
        nodes.push({ key: tl.id, lead: tl, reps: repsByManager.get(tl.id) || [], asTeamLead: false });
      }
      return nodes;
    };

    // Search filter, applied down the tree: keep a rep if it matches, a lead if it
    // matches or has a matching rep, a branch manager if it matches or has any
    // surviving lead node.
    const keepLead = (n: LeadNode): LeadNode | null => {
      const reps = n.reps.filter(match);
      return match(n.lead) || reps.length > 0 ? { ...n, reps } : null;
    };

    const branchTree = branchManagerList
      .map((bm) => ({ branchManager: bm, leadNodes: leadNodesFor(bm).map(keepLead).filter(Boolean) as LeadNode[] }))
      .filter(({ branchManager, leadNodes }) => match(branchManager) || leadNodes.length > 0);

    const orphanLeads = orphanLeadList
      .map((tl) => ({ manager: tl, reps: (repsByManager.get(tl.id) || []).filter(match), self: match(tl) }))
      .filter(({ self, reps }) => self || reps.length > 0);

    return {
      cLevel: cLevelList.filter(match),
      branchTree,
      orphanLeads,
      admins: adminList.filter(match),
      marketing: marketingList.filter(match),
      unassigned: noManager.filter(match),
      counts: {
        cLevel: cLevelList.length,
        branchManagers: branchManagerList.length,
        admins: adminList.length,
        managers: teamLeadList.length,
        sales: sales.length,
        marketing: marketingList.length,
      },
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

  const nothing = cLevel.length === 0 && branchTree.length === 0 && orphanLeads.length === 0 && admins.length === 0 && marketing.length === 0 && unassigned.length === 0;
  const hasLeadership = cLevel.length > 0 || branchTree.length > 0;

  return (
    <div>
      {/* Summary */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        {stat("C-Level", counts.cLevel, ROLE["c-level"].dot)}
        {stat("Branch Managers", counts.branchManagers, ROLE["branch-manager"].dot)}
        {stat("Sales Team Leads", counts.managers, ROLE["sales-team-lead"].dot)}
        {stat("Sales", counts.sales, ROLE.sales.dot)}
        {stat("Marketing", counts.marketing, ROLE.marketing.dot)}
        {stat("Admins", counts.admins, ROLE.admin.dot)}
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
        <div
          className="chart-scroll"
          ref={setScrollEl}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => { setHovered(false); onDragEnd(); }}
          onMouseDown={onDragStart}
          onMouseMove={onDragMove}
          onMouseUp={onDragEnd}
        >
          <div className="tree" style={{ zoom }}>
            {/* Tier 1: C-Level */}
            {cLevel.length > 0 && (
              <div className="admin-row">
                {cLevel.map((a) => <Node key={a.id} user={a} isYou={a.id === user?.id} />)}
              </div>
            )}

            {cLevel.length > 0 && branchTree.length > 0 && <div className="trunk" />}

            {/* Tier 2 → 3 → 4: Branch Manager → Sales Team Lead → Sales Reps.
                A branch manager who also runs a team shows a second time here as
                their own Sales Team Lead card, carrying the reps that report
                directly to them. */}
            {branchTree.length > 0 && (
              <ul className="branch">
                {branchTree.map(({ branchManager, leadNodes }) => (
                  <li key={branchManager.id}>
                    <Node user={branchManager} isYou={branchManager.id === user?.id} />
                    {leadNodes.length > 0 && (
                      <ul>
                        {leadNodes.map(({ key, lead, reps, asTeamLead }) => (
                          <li key={key}>
                            <Node
                              user={lead}
                              isYou={!asTeamLead && lead.id === user?.id}
                              roleOverride={asTeamLead ? "sales-team-lead" : undefined}
                            />
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
                  </li>
                ))}
              </ul>
            )}

            {/* Sales Team Leads with no branch manager (data gaps) — their own bus. */}
            {hasLeadership && orphanLeads.length > 0 && <div className="trunk" />}
            {orphanLeads.length > 0 && (
              <ul className="branch">
                {orphanLeads.map(({ manager, reps }) => (
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

      {/* Admins — always at the very bottom, under Marketing. */}
      {admins.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div className="side-title" style={{ color: ROLE.admin.text }}>Admins · {admins.length}</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {admins.map((a) => <Node key={a.id} user={a} isYou={a.id === user?.id} />)}
          </div>
        </div>
      )}

      <style jsx>{`
        .chart-scroll { overflow: auto; padding: 8px 0 12px; cursor: grab; user-select: none; }
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
