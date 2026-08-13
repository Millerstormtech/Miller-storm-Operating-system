// src/components/LeaderboardBoard.tsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { BRANCHES } from "../lib/repcard/branches";
import { TEAM_NAMES, TEAM_LEADS } from "../lib/repcard/org-chart";
import { GuidedTour } from "../portals/shared/guided-tour/GuidedTour";
import { SALES_LEADERBOARD_TOUR } from "../portals/shared/guided-tour/definitions/salesLeaderboard";
import { compareStanding } from "../lib/leaderboard/ranking";
import { RepAvatar } from "./RepAvatar";
import { ExportReportButton, type ExportRequest, type ExportScope } from "./report/ExportReportButton";
import {
  buildSalesReport,
  salesDefaultTitle,
  salesFields,
  type SalesExportContext,
  type SalesExportRow,
} from "../lib/report/salesBoard";

type Window = "day" | "week" | "month" | "year";
const WINDOWS: { key: Window; label: string }[] = [
  { key: "day", label: "Today" },
  { key: "week", label: "Week to Date" },
  { key: "month", label: "Month to Date" },
  { key: "year", label: "Year to Date" },
];

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n ?? 0);

// Sentinel filter values. "" = show all; "__none__" = only rows missing that field.
const ALL = "";
const NONE = "__none__";

// Column definitions drive both the header row and the click-to-sort behavior.
type SortKey = "name" | "branch" | "team" | "verifiedKnocks" | "leadsCreated" | "filed" | "won" | "revenue";
type ColType = "text" | "num" | "money";
const COLUMNS: { key: SortKey; label: string; type: ColType }[] = [
  { key: "name", label: "Rep", type: "text" },
  { key: "branch", label: "Branch", type: "text" },
  { key: "team", label: "Team", type: "text" },
  { key: "verifiedKnocks", label: "Verified Door Knocks", type: "num" },
  { key: "leadsCreated", label: "Leads Created", type: "num" },
  { key: "filed", label: "Claims Filed", type: "num" },
  { key: "won", label: "Contracts", type: "num" },
  { key: "revenue", label: "Contract Amount", type: "money" },
];

export function LeaderboardBoard({ currentUserId }: { currentUserId?: string }) {
  const [window, setWindow] = useState<Window>("month");
  const [isCustom, setIsCustom] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // The active query (a quick window OR a from/to range) — the single fetch trigger.
  const [query, setQuery] = useState("window=month");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // This calendar month's top rep by Contract Amount. Computed server-side from
  // its OWN month window, so it does not change meaning when a different period
  // is selected. null until someone signs their first contract of the month.
  const [contractKing, setContractKing] = useState<
    { id: string; name: string; revenue: number; headshotUrl: string; monthLabel: string } | null
  >(null);

  // Filters + sort (all applied client-side over the fetched rows).
  const [branchFilter, setBranchFilter] = useState<string>(ALL);
  const [teamFilter, setTeamFilter] = useState<string>(ALL);
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  // "Hide former reps" — off by default so everyone shows. Filters out reps flagged
  // `former` by the API (RepCard status !== ACTIVE). Just hides rows; rank is unaffected.
  const [hideFormer, setHideFormer] = useState(false);
  // Rep filter (multi-select, deferred apply): `draftReps` = in-panel checkboxes;
  // `appliedReps` = what the table filters by (only updated on "Show Selected").
  const [appliedReps, setAppliedReps] = useState<Set<string>>(new Set());
  const [draftReps, setDraftReps] = useState<Set<string>>(new Set());
  const [repOpen, setRepOpen] = useState(false);
  const [repSearch, setRepSearch] = useState("");
  // Custom date range is tucked behind a toggle so the period pills stay clean.
  const [showCustom, setShowCustom] = useState(false);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leaderboard?${q}`);
      if (res.ok) {
        const data = await res.json();
        setRows(data.leaderboard ?? []);
        setContractKing(data.contractKing ?? null);
        // Echo the resolved range into the From/To boxes (fills them for quick views).
        if (data.range) { setFrom(data.range.from); setTo(data.range.to); }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(query); }, [query, load]);

  // Follow the app-wide light/dark theme (the header toggle sets data-theme on
  // <html>). Mirror it into state so styled-jsx can restyle via a class, and
  // observe the attribute so the toggle switches this board live.
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const read = () =>
      setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  // The board now shows its OWN heading (mockup style) inside the card, so hide
  // the layout's duplicate page-title band on this page. Self-contained: find
  // the band as the element right before the page content and restore it on
  // unmount. Kept out of the layout files on purpose.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let el: HTMLElement | null = rootRef.current;
    let band: HTMLElement | null = null;
    while (el && el.parentElement) {
      const prev = el.previousElementSibling as HTMLElement | null;
      const h1 = prev?.querySelector("h1");
      if (prev && h1 && /leaderboard/i.test(h1.textContent || "") && !prev.querySelector("table, form, input")) {
        band = prev;
        break;
      }
      el = el.parentElement;
    }
    if (band) {
      const prevDisplay = band.style.display;
      band.style.display = "none";
      return () => { band!.style.display = prevDisplay; };
    }
  }, []);

  // Quick view selected -> exit custom mode and refetch by window.
  const pickWindow = (w: Window) => { setWindow(w); setIsCustom(false); setShowCustom(false); setQuery(`window=${w}`); };
  // A date edited -> custom mode; refetch once both ends are set.
  const pickDates = (f: string, t: string) => { setFrom(f); setTo(t); if (f && t) { setIsCustom(true); setQuery(`from=${f}&to=${t}`); } };

  // Rep multi-select handlers. Opening seeds the draft from the applied set; ticking only
  // mutates the draft (table unchanged); "Show Selected" commits draft -> applied.
  const openRepPanel = () => { setDraftReps(new Set(appliedReps)); setRepSearch(""); setRepOpen(true); };
  const toggleDraftRep = (id: string) => setDraftReps((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const applyReps = () => { setAppliedReps(new Set(draftReps)); setRepOpen(false); };

  // Fixed, never-culled filter options: the full branch/team lists always show,
  // regardless of which reps have data in the current range. The "(No ...)" bucket
  // appears only when some row genuinely lacks that field.
  const branchOptions = useMemo(
    () => ({ list: [...BRANCHES, "Commercial"], hasBlank: rows.some((r) => !r.branch) }),
    [rows]
  );
  const teamOptions = useMemo(
    () => ({ list: TEAM_NAMES, hasNone: rows.some((r) => !r.team) }),
    [rows]
  );

  // Every rep on the board (stable across windows -> roster = all active reps), for the
  // Rep multi-select. De-duplicated by id, sorted by name.
  const repList = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (r.id && !seen.has(r.id)) seen.set(r.id, r.name || "Unknown Rep");
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const visible = useMemo(() => {
    const branchActive = !!branchFilter && branchFilter !== NONE;
    const filtered = rows
      .map((r) => {
        // A real branch filter scopes a rep's numbers to just that branch's sales
        // (from byBranch). Rows with no data in that branch drop out. No filter -> totals.
        if (branchActive) {
          const b = r.byBranch?.[branchFilter];
          if (!b) return null;
          return { ...r, verifiedKnocks: b.verifiedKnocks, leadsCreated: b.leadsCreated, filed: b.filed, won: b.won, revenue: b.revenue };
        }
        return r;
      })
      .filter((r: any) => r !== null)
      .filter((r: any) => {
        if (hideFormer && r.former) return false; // "Hide former reps" toggle
        if (appliedReps.size > 0 && !appliedReps.has(r.id)) return false; // Rep multi-select
        if (branchFilter === NONE && r.branch) return false; // "(No branch)" bucket only
        // Team filter
        if (teamFilter === NONE) { if (r.team) return false; }
        else if (teamFilter && r.team !== teamFilter) return false;
        return true;
      });

    const col = COLUMNS.find((c) => c.key === sortKey);
    const dir = sortDir === "asc" ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      const primary = col?.type === "text"
        ? String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? "")) * dir
        : ((a[sortKey] ?? 0) - (b[sortKey] ?? 0)) * dir;
      // On any tie in the clicked column, fall back to overall standing (Contract
      // Amount -> Contracts -> Claims Filed -> Leads Created -> Verified Door Knocks).
      return primary || compareStanding(a, b);
    });
    return sorted;
  }, [rows, branchFilter, teamFilter, appliedReps, sortKey, sortDir, hideFormer]);

  // The logged-in user's own row — drives the "your rank" pop-out banner.
  // `rank` is the overall revenue rank for the selected window (from the API).
  const me = useMemo(
    () => (currentUserId ? rows.find((r) => r.repUserId === currentUserId) : undefined),
    [rows, currentUserId]
  );

  function onSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Text columns read best A→Z; number columns best high→low.
      setSortDir(COLUMNS.find((c) => c.key === key)?.type === "text" ? "asc" : "desc");
    }
  }

  const arrow = (key: SortKey) => (key === sortKey ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  // While a real branch filter is active, the numbers are that ONE branch's sales, so a
  // rep's home Branch/Team would only contradict the filter (a Fort Worth rep in the West
  // Texas list). Hide those two columns to remove the confusion; the banner explains why.
  const branchActive = !!branchFilter && branchFilter !== NONE;
  const visibleColumns = branchActive ? COLUMNS.filter((c) => c.key !== "branch" && c.key !== "team") : COLUMNS;

  // Footer "Sum" row totals. Reduced over `visible` (the on-screen rows), so it reflects
  // the current view automatically — filters, branch scoping, and date range all included.
  const totals = visible.reduce(
    (a, r) => {
      a.verifiedKnocks += r.verifiedKnocks ?? 0;
      a.leadsCreated += r.leadsCreated ?? 0;
      a.filed += r.filed ?? 0;
      a.won += r.won ?? 0;
      a.revenue += r.revenue ?? 0;
      return a;
    },
    { verifiedKnocks: 0, leadsCreated: 0, filed: 0, won: 0, revenue: 0 }
  );

  // ---- Export report -------------------------------------------------------
  // "Full board" drops the row filters but NEVER the period: the period is not a
  // client-side filter, it is what the API was asked to fetch. `boardRows` is
  // therefore `rows`, the unfiltered set for the selected range.
  const boardRows = rows;
  const todayIso = new Date().toISOString().slice(0, 10);
  const periodLabel = isCustom ? "Custom range" : WINDOWS.find((w) => w.key === window)?.label || "Month to Date";

  const exportContext = useCallback(
    (scope: ExportScope): SalesExportContext => ({
      scope,
      periodLabel,
      from,
      to,
      branch: branchFilter,
      team: teamFilter,
      selectedRepCount: appliedReps.size,
      hideFormer,
      rowCount: scope === "view" ? visible.length : boardRows.length,
    }),
    [periodLabel, from, to, branchFilter, teamFilter, appliedReps, hideFormer, visible.length, boardRows.length]
  );

  const toExportRow = (r: any): SalesExportRow => ({
    id: r.id,
    name: r.name,
    branch: r.branch || "",
    team: r.team || "",
    verifiedKnocks: r.verifiedKnocks ?? 0,
    leadsCreated: r.leadsCreated ?? 0,
    filed: r.filed ?? 0,
    won: r.won ?? 0,
    revenue: r.revenue ?? 0,
  });

  const buildExport = (req: ExportRequest) => {
    // Full board is ordered by the board's own standing rule, not by whatever
    // column happens to be sorted on screen.
    const source = req.scope === "view" ? visible : [...boardRows].sort(compareStanding);
    return buildSalesReport({
      rows: source.map(toExportRow),
      context: exportContext(req.scope),
      title: req.title,
      note: req.note,
      selectedKeys: req.selectedKeys,
      isoDate: todayIso,
    });
  };

  // Board subtitle reflects the ACTUAL selected period + the date range the API
  // resolved for it (echoed into from/to), so it changes with the user's filter.
  const fmtD = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const headSub = isCustom
    ? (from && to ? `${fmtD(from)} – ${fmtD(to)}` : "Custom range")
    : window === "day"
      ? (to ? `Today · ${fmtD(to)}` : "Today")
    : window === "week"
      ? (from && to ? `Week to date · ${fmtD(from)} – ${fmtD(to)}` : "Week to date")
    : window === "month"
      ? (from ? `${new Date(from + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })}, month to date` : "Month to date")
      : (from ? `${new Date(from + "T00:00:00").getFullYear()}, year to date` : "Year to date");

  return (
    <div className={`sl sl--${theme}`} ref={rootRef}>
      <GuidedTour tour={SALES_LEADERBOARD_TOUR} ready={!loading} />

      {/* Title, inside the board — like the mockup. The period pills now live in
          the filters row below, next to Branch/Team, instead of alone up here. */}
      <div className="sl__head">
        <div className="sl__head-titles">
          <h1 className="sl__head-title">Sales Leaderboard</h1>
          <p className="sl__head-sub">{headSub}</p>
        </div>
      </div>

      {/* "Your rank" pop-out — any user on the board sees their own standing. */}
      {me && (
        <div className="sl__banner sl__banner--rank" data-tour="your-rank">
          <div className="sl__banner-emoji">🏆</div>
          <div className="sl__banner-main">
            <div className="sl__banner-eyebrow">
              YOUR RANK · {isCustom ? "Custom range" : WINDOWS.find((w) => w.key === window)?.label}
            </div>
            <div className="sl__banner-title">
              #{me.rank}
              <span className="sl__banner-sub"> of {rows.length}</span>
            </div>
          </div>
          <div className="sl__banner-stats">
            <div><div className="sl__stat-val">{fmtMoney(me.revenue)}</div><div className="sl__stat-lbl">Contract Amount</div></div>
            <div><div className="sl__stat-val">{me.won ?? 0}</div><div className="sl__stat-lbl">Contracts</div></div>
            <div><div className="sl__stat-val">{me.verifiedKnocks ?? 0}</div><div className="sl__stat-lbl">Knocks</div></div>
          </div>
        </div>
      )}

      {/* Contract King: this month's top rep by Contract Amount. */}
      {contractKing && (
        <div className="sl__king" data-tour="contract-king">
          <div className="sl__king-medal">
            <RepAvatar name={contractKing.name} url={contractKing.headshotUrl} size={54} fontSize={22} />
            <span className="sl__king-crown">1</span>
          </div>
          <div className="sl__king-main">
            <div className="sl__king-eyebrow">👑 {contractKing.monthLabel.toUpperCase()} CONTRACT KING</div>
            <div className="sl__king-name">{contractKing.name}</div>
          </div>
          <div className="sl__king-amount">{fmtMoney(contractKing.revenue)}</div>
        </div>
      )}

      {/* Filters row — period pills sit alongside Branch/Team/rep filters. */}
      <div className="sl__filters" data-tour="filters">
        <div className="sl__periods">
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              type="button"
              className={`sl__pill${!isCustom && window === w.key ? " sl__pill--on" : ""}`}
              onClick={() => pickWindow(w.key)}
            >
              {w.label}
            </button>
          ))}
          <button
            type="button"
            className={`sl__pill${isCustom ? " sl__pill--on" : ""}`}
            onClick={() => setShowCustom((s) => !s)}
          >
            Custom
          </button>
        </div>
        <label className="sl__field">
          <span>Branch</span>
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="sl__select">
            <option value={ALL}>All</option>
            {branchOptions.list.map((b) => <option key={b} value={b}>{b}</option>)}
            {branchOptions.hasBlank ? <option value={NONE}>(No branch)</option> : null}
          </select>
        </label>
        <label className="sl__field">
          <span>Team</span>
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="sl__select">
            <option value={ALL}>All</option>
            {teamOptions.list.map((t) => <option key={t} value={t}>{TEAM_LEADS[t] || t}</option>)}
            {teamOptions.hasNone ? <option value={NONE}>(No team)</option> : null}
          </select>
        </label>

        <div className="sl__rep-wrap">
          <button type="button" className="sl__chip" onClick={() => (repOpen ? setRepOpen(false) : openRepPanel())}>
            {appliedReps.size ? `${appliedReps.size} reps selected` : "Search reps"} ▾
          </button>
          {repOpen ? (
            <>
              <div onClick={() => setRepOpen(false)} className="sl__overlay" />
              <div className="sl__rep-panel">
                <input value={repSearch} onChange={(e) => setRepSearch(e.target.value)} placeholder="Search reps…" className="sl__rep-search" />
                <div className="sl__rep-list">
                  {repList.filter((rp) => rp.name.toLowerCase().includes(repSearch.toLowerCase())).map((rp) => (
                    <label key={rp.id} className="sl__rep-item">
                      <input type="checkbox" checked={draftReps.has(rp.id)} onChange={() => toggleDraftRep(rp.id)} />
                      {rp.name}
                    </label>
                  ))}
                </div>
                <div className="sl__rep-actions">
                  <button onClick={() => setDraftReps(new Set())} className="sl__link">Clear</button>
                  <button onClick={applyReps} className="sl__apply">Show Selected ({draftReps.size})</button>
                </div>
              </div>
            </>
          ) : null}
        </div>

        <label className="sl__toggle" title="Hide reps who are no longer active in RepCard">
          <input type="checkbox" checked={hideFormer} onChange={(e) => setHideFormer(e.target.checked)} />
          Hide former reps
        </label>

        {(branchFilter || teamFilter || appliedReps.size || hideFormer) ? (
          <button className="sl__chip" onClick={() => { setBranchFilter(ALL); setTeamFilter(ALL); setAppliedReps(new Set()); setHideFormer(false); }}>
            Clear filters
          </button>
        ) : null}

        <div className="sl__export">
          <ExportReportButton
            viewCount={visible.length}
            boardCount={boardRows.length}
            defaultTitle={(scope) => salesDefaultTitle(exportContext(scope))}
            fieldsFor={(scope) => salesFields(exportContext(scope))}
            buildDocument={buildExport}
            disabledReason={loading ? "Still loading" : undefined}
          />
        </div>
        <span className="sl__count">{visible.length} rep{visible.length === 1 ? "" : "s"}</span>
      </div>

      {showCustom && (
        <div className="sl__custom">
          <label>From <input type="date" value={from} max={to || undefined} onChange={(e) => pickDates(e.target.value, to)} className="sl__date" /></label>
          <label>To <input type="date" value={to} min={from || undefined} onChange={(e) => pickDates(from, e.target.value)} className="sl__date" /></label>
        </div>
      )}

      {branchFilter && branchFilter !== NONE ? (
        <div className="sl__note">
          Showing <strong>{branchFilter}</strong> sales. Numbers are for this branch only. Branch and Team columns are hidden while a branch filter is on, because a rep based in another branch can appear here for their {branchFilter} sales.
        </div>
      ) : null}

      <details className="sl__guide" data-tour="board-guide">
        <summary>ℹ️ How to read this board</summary>
        <ul>
          <li><strong>Who&apos;s listed here:</strong> every active sales rep.</li>
          <li>A rep can sell in more than one branch (for example, when storm-chasing away from home). Filtering by branch shows only the sales made in that branch. In this case each row shows only that rep&apos;s sales data for the filtered branch. Remove the branch filter to see their full total across every branch.</li>
          <li>However, <strong>Verified Door Knocks</strong> is the only data point that always counts under a rep&apos;s home branch. So if you filter to another branch where the rep made sales, you&apos;ll see those sales (as mentioned in the previous point) but their knocks show as 0 there.</li>
        </ul>
      </details>

      <div className="sl__legend">
        <span><span className="sl__dot" /> No AccuLynx account (rep not set up in AccuLynx)</span>
        <span><span aria-hidden="true">❌</span> Former rep (deactivated in RepCard)</span>
      </div>

      {loading ? (
        <p className="sl__loading">Loading leaderboard…</p>
      ) : (
        <>
        <div className="leaderboard-table-wrap sl__table-wrap">
          <table className="sl__table" style={{ minWidth: 720 }}>
            <thead data-tour="columns">
              <tr>
                <th className="sl__th sl__th--rank">#</th>
                {visibleColumns.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => onSort(c.key)}
                    title="Click to sort"
                    className={`sl__th${c.type !== "text" ? " sl__th--num" : ""}${c.key === sortKey ? " sl__th--active" : ""}`}
                  >
                    {c.label}{arrow(c.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={visibleColumns.length + 1} className="sl__empty">No reps match these filters.</td></tr>
              ) : visible.map((r, i) => {
                const isYou = currentUserId && r.repUserId === currentUserId;
                return (
                  <tr key={r.id} className={`sl__row${i === 0 ? " sl__row--top" : ""}${isYou ? " sl__row--you" : ""}`}>
                    <td className={`sl__rank${i === 0 ? " sl__rank--gold" : ""}`}>{i + 1}</td>
                    <td className="sl__rep">
                      <span className="sl__rep-inner">
                        <RepAvatar name={r.name} url={r.headshotUrl} size={26} />
                        {r.source === "repcard" ? <span title="No AccuLynx account" className="sl__dot" /> : null}
                        <span className="sl__rep-name">{r.name}{isYou ? " (You)" : ""}</span>
                        {contractKing && r.id === contractKing.id ? (
                          <span title={`Top Contract Amount this month (${contractKing.monthLabel})`}>👑</span>
                        ) : null}
                      </span>
                    </td>
                    {!branchActive ? (
                      <>
                        <td className="sl__muted">{r.branch || "—"}</td>
                        <td className="sl__muted">{TEAM_LEADS[r.team] || r.team || "—"}</td>
                      </>
                    ) : null}
                    <td className="sl__num">{r.verifiedKnocks ?? 0}</td>
                    <td className="sl__num">{r.leadsCreated ?? 0}</td>
                    <td className="sl__num">{r.filed}</td>
                    <td className="sl__num">{r.won}</td>
                    <td className="sl__amount">{fmtMoney(r.revenue)}</td>
                  </tr>
                );
              })}
            </tbody>
            {visible.length > 0 ? (
              <tfoot>
                <tr className="sl__foot">
                  <td colSpan={branchActive ? 2 : 4} className="sl__foot-label">
                    Sum ({visible.length} rep{visible.length === 1 ? "" : "s"})
                  </td>
                  <td className="sl__num">{totals.verifiedKnocks}</td>
                  <td className="sl__num">{totals.leadsCreated}</td>
                  <td className="sl__num">{totals.filed}</td>
                  <td className="sl__num">{totals.won}</td>
                  <td className="sl__amount">{fmtMoney(totals.revenue)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        {/* Mobile: app-style leaderboard cards. */}
        <div className="leaderboard-cards sl__cards">
          {visible.length === 0 ? (
            <div className="sl__empty">No reps match these filters.</div>
          ) : visible.map((r, i) => {
            const isYou = currentUserId && r.repUserId === currentUserId;
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
            const subtitle = [r.branch, TEAM_LEADS[r.team] || r.team].filter(Boolean).join(" · ");
            return (
              <div key={r.id} className={`sl__card${i === 0 ? " sl__card--top" : ""}${isYou ? " sl__card--you" : ""}`}>
                <div className="sl__card-head">
                  <div className={`sl__card-rank${i === 0 ? " sl__rank--gold" : ""}`}>{medal || i + 1}</div>
                  <RepAvatar name={r.name} url={r.headshotUrl} size={44} fontSize={18} />
                  <div className="sl__card-id">
                    <div className="sl__card-name">
                      {r.source === "repcard" ? <span title="No AccuLynx account" className="sl__dot" /> : null}
                      {r.name}{isYou ? " (You)" : ""}
                    </div>
                    {subtitle ? <div className="sl__card-sub">{subtitle}</div> : null}
                  </div>
                  <div className="sl__card-amount">{fmtMoney(r.revenue)}</div>
                </div>
                <div className="sl__card-div" />
                <div className="sl__card-stats">
                  {([["🚪 Knocks", r.verifiedKnocks ?? 0], ["Claims Filed", r.filed ?? 0], ["Contracts", r.won ?? 0]] as [string, number][]).map(([label, value], k) => (
                    <div key={k} className="sl__card-stat">
                      <div className="sl__card-stat-val">{value}</div>
                      <div className="sl__card-stat-lbl">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}

      <style jsx>{`
        .sl {
          /* Dark theme (default) */
          --bg: #0d0d0f;
          --card-border: rgba(255, 255, 255, 0.06);
          --text: #f4f4f6;
          --muted: #9aa0a6;
          --subtle: #7f858c;
          --line: rgba(255, 255, 255, 0.06);
          --th: #8b9096;
          --th-bg: #0d0d0f;
          --th-active: #ff5a5c;
          --chip-bg: rgba(255, 255, 255, 0.04);
          --chip-border: rgba(255, 255, 255, 0.14);
          --chip-text: #e7e8ea;
          --pill-text: #c7c9ce;
          --pill-border: rgba(255, 255, 255, 0.14);
          --num: #e7e8ea;
          --amount: #ffffff;
          --rank: #6b7075;
          --gold: #f1c33c;
          --panel: #141416;
          --panel-line: rgba(255, 255, 255, 0.12);
          --hover: rgba(255, 255, 255, 0.03);
          --you: rgba(202, 0, 2, 0.1);
          --top-grad: linear-gradient(90deg, rgba(202, 0, 2, 0.28), rgba(202, 0, 2, 0.04) 70%, transparent);
          --wm-op: 0.08;
          --note-bg: rgba(37, 99, 235, 0.12);
          --note-border: rgba(37, 99, 235, 0.35);
          --note-text: #bcd0ff;
          --guide-bg: rgba(255, 255, 255, 0.03);
          --rep-panel-bg: #1a1a1d;

          position: relative;
          background: var(--bg);
          border: 1px solid var(--card-border);
          border-radius: 18px;
          padding: 4px 24px 8px;
          color: var(--text);
          overflow: hidden;
        }
        /* Light theme — applied via a class the component sets from data-theme. */
        .sl.sl--light {
          --bg: transparent;
          --card-border: transparent;
          --text: #14161a;
          --muted: #6b7280;
          --subtle: #9aa3ad;
          --line: #eceef1;
          --th: #6b7280;
          --th-bg: #f6f7f9;
          --th-active: #ca0002;
          --chip-bg: #ffffff;
          --chip-border: #d8dbdf;
          --chip-text: #374151;
          --pill-text: #4b5563;
          --pill-border: #d8dbdf;
          --num: #1f2937;
          --amount: #111827;
          --rank: #9aa3ad;
          --gold: #cf9412;
          --panel: #ffffff;
          --panel-line: #e5e7eb;
          --hover: #f6f7f9;
          --you: rgba(202, 0, 2, 0.05);
          --top-grad: linear-gradient(90deg, rgba(202, 0, 2, 0.1), rgba(202, 0, 2, 0.02) 70%, transparent);
          --wm-op: 0.08;
          --note-bg: #eff6ff;
          --note-border: #bfdbfe;
          --note-text: #1e40af;
          --guide-bg: #f8fafc;
          --rep-panel-bg: #ffffff;
        }
        .sl::before {
          content: "";
          position: absolute;
          inset: 0;
          background: url("/ChatGPT_Image_Feb_23__2026__07_00_52_PM-removebg-preview.png") center 50% / min(860px, 70%) no-repeat;
          opacity: var(--wm-op);
          pointer-events: none;
        }
        .sl > * { position: relative; z-index: 1; }

        /* Board heading (mockup: big condensed title + period subtitle, pills right) */
        .sl__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
        .sl__head-titles { min-width: 0; }
        .sl__head-title {
          margin: 0;
          font-family: "Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif;
          font-size: clamp(22px, 2.6vw, 30px);
          line-height: 1;
          font-weight: 900;
          letter-spacing: 0.01em;
          text-transform: capitalize;
          color: var(--text);
        }
        .sl__head-sub { margin: 8px 0 0; font-size: 15px; color: var(--muted); }

        .sl__periods { display: flex; gap: 8px; flex-wrap: nowrap; flex-shrink: 0; justify-content: flex-start; }
        @media (max-width: 1100px) { .sl__periods { flex-wrap: wrap; } }
        .sl__pill { padding: 8px 14px; border-radius: 999px; cursor: pointer; font-size: 13px; font-weight: 600; white-space: nowrap; color: var(--pill-text); background: transparent; border: 1px solid var(--pill-border); transition: background 0.15s, color 0.15s, border-color 0.15s; }
        .sl__pill:hover { color: var(--text); }
        .sl__pill--on { background: linear-gradient(90deg, #b30002, #e01418); color: #fff; border-color: transparent; box-shadow: 0 6px 18px rgba(202, 0, 2, 0.35); }

        .sl__custom { display: flex; gap: 16px; margin-bottom: 16px; font-size: 13px; color: var(--muted); flex-wrap: wrap; }
        .sl__date { margin-left: 6px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--chip-border); background: var(--chip-bg); color: var(--text); }

        .sl__banner { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; border-radius: 14px; padding: 16px 20px; margin-bottom: 16px; }
        .sl__banner--rank { background: linear-gradient(135deg, #1e3a8a, #2563eb); color: #fff; box-shadow: 0 8px 24px rgba(37, 99, 235, 0.28); }
        .sl__banner-emoji { font-size: 34px; line-height: 1; }
        .sl__banner-main { flex: 1; min-width: 160px; }
        .sl__banner-eyebrow { font-size: 12px; opacity: 0.85; font-weight: 700; letter-spacing: 0.4px; }
        .sl__banner-title { font-size: 26px; font-weight: 800; margin-top: 2px; }
        .sl__banner-sub { font-size: 15px; font-weight: 600; opacity: 0.85; }
        .sl__banner-stats { display: flex; gap: 22px; text-align: right; }
        .sl__stat-val { font-size: 18px; font-weight: 800; }
        .sl__stat-lbl { font-size: 11px; opacity: 0.8; }

        .sl__king { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; background: linear-gradient(100deg, #7a0d10 0%, #b31217 55%, #7a0d10 100%); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 16px 22px; margin-bottom: 18px; color: #fff; box-shadow: 0 10px 30px rgba(150, 10, 14, 0.35); }
        .sl__king-medal { position: relative; flex-shrink: 0; }
        .sl__king-crown { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 20px; color: #3a2400; background: radial-gradient(circle at 50% 35%, #ffe27a, #e8b923 55%, #a9800f); border-radius: 50%; border: 3px solid #f6d976; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); }
        .sl__king-main { flex: 1; min-width: 160px; }
        .sl__king-eyebrow { font-size: 12px; letter-spacing: 1.5px; font-weight: 700; opacity: 0.9; text-transform: uppercase; }
        .sl__king-name { font-size: 24px; font-weight: 800; margin-top: 3px; }
        .sl__king-amount { font-size: 34px; font-weight: 900; letter-spacing: -0.5px; margin-left: auto; }

        /* Above the table sibling so the "Search reps" dropdown isn't painted
           over by it (.sl > * pins every child to z-index 1). */
        .sl__filters { display: flex; gap: 9px; margin-bottom: 16px; flex-wrap: nowrap; align-items: center; position: relative; z-index: 15; }
        @media (max-width: 1100px) { .sl__filters { flex-wrap: wrap; } }
        .sl__field { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; }
        .sl__select, .sl__chip { padding: 9px 14px; border-radius: 999px; border: 1px solid var(--chip-border); background: var(--chip-bg); color: var(--chip-text); font-weight: 600; font-size: 13px; cursor: pointer; }
        .sl__toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--pill-text); font-weight: 600; cursor: pointer; }
        .sl__rep-wrap { position: relative; display: inline-block; }
        .sl__overlay { position: fixed; inset: 0; z-index: 20; }
        .sl__rep-panel { position: absolute; z-index: 40; top: calc(100% + 6px); left: 0; width: 260px; background: #1a1a1d; border: 1px solid var(--panel-line); border-radius: 12px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45); padding: 10px; }
        .sl.sl--light .sl__rep-panel { background: #ffffff; box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18); }
        .sl__rep-search { width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--chip-border); background: var(--chip-bg); color: var(--text); margin-bottom: 8px; box-sizing: border-box; font-size: 13px; }
        .sl__rep-list { max-height: 220px; overflow-y: auto; margin-bottom: 8px; }
        .sl__rep-item { display: flex; align-items: center; gap: 8px; padding: 5px 2px; font-size: 13px; cursor: pointer; color: var(--text); }
        .sl__rep-actions { display: flex; justify-content: space-between; align-items: center; }
        .sl__link { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 12px; padding: 0; }
        .sl__apply { padding: 7px 14px; border-radius: 8px; border: none; background: linear-gradient(90deg, #b30002, #e01418); color: #fff; font-weight: 700; cursor: pointer; font-size: 13px; }
        .sl__export :global(button) { border-radius: 999px !important; }
        .sl__count { font-size: 13px; color: var(--subtle); margin-left: auto; }

        .sl__note { margin-bottom: 12px; background: var(--note-bg); border: 1px solid var(--note-border); border-radius: 10px; padding: 9px 14px; font-size: 12.5px; color: var(--note-text); }
        .sl__guide { margin-bottom: 12px; background: var(--guide-bg); border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; }
        .sl__guide summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--pill-text); }
        .sl__guide ul { margin: 10px 0 2px; padding-left: 18px; font-size: 12.5px; color: var(--muted); line-height: 1.6; }
        .sl__legend { display: flex; gap: 16px; margin-bottom: 14px; font-size: 12px; color: var(--muted); flex-wrap: wrap; }
        .sl__legend span { display: inline-flex; align-items: center; gap: 6px; }
        .sl__dot { width: 9px; height: 9px; border-radius: 50%; background: #f59e0b; display: inline-block; flex-shrink: 0; }
        .sl__loading { color: var(--muted); }
        .sl__empty { text-align: center; padding: 22px; color: var(--subtle); }

        .sl__table-wrap { border-radius: 14px; }
        .sl__table { width: 100%; border-collapse: collapse; }
        .sl__th { padding: 12px 16px; font-size: 12px; font-weight: 700; cursor: pointer; user-select: none; text-transform: uppercase; letter-spacing: 0.6px; text-align: left; color: var(--th); background: var(--th-bg); position: sticky; top: 0; z-index: 2; border-bottom: 1px solid var(--line); }
        .sl__th--num { text-align: center; }
        .sl__th--rank { text-align: center; width: 64px; }
        .sl__th--active { color: var(--th-active); }

        .sl__row { border-bottom: 1px solid var(--line); transition: background 0.12s; }
        .sl__row:hover { background: var(--hover); }
        .sl__row--you { background: var(--you); }
        .sl__row--top { background: var(--top-grad); box-shadow: inset 3px 0 0 #ca0002; }
        .sl__rank { padding: 14px 16px; text-align: center; font-weight: 800; font-size: 22px; color: var(--rank); width: 64px; }
        .sl__rank--gold { color: var(--gold); }
        .sl__rep { padding: 12px 16px; font-weight: 700; }
        .sl__rep-inner { display: inline-flex; align-items: center; gap: 10px; }
        .sl__rep-name { color: var(--text); text-transform: uppercase; letter-spacing: 0.3px; font-size: 14px; }
        .sl__muted { padding: 12px 16px; color: var(--muted); font-size: 14px; }
        .sl__num { padding: 12px 16px; text-align: center; font-weight: 600; color: var(--num); font-variant-numeric: tabular-nums; font-size: 15px; }
        .sl__amount { padding: 12px 16px; text-align: right; font-weight: 800; color: var(--amount); font-variant-numeric: tabular-nums; font-size: 17px; white-space: nowrap; }
        .sl__foot td { position: sticky; bottom: 0; z-index: 2; background: var(--panel); border-top: 2px solid var(--panel-line); padding: 12px 16px; font-weight: 800; }
        .sl__foot-label { text-align: left; color: var(--pill-text); }

        .sl__card { margin-bottom: 10px; background: var(--panel); border-radius: 14px; border: 1px solid var(--line); padding: 12px; }
        .sl__card--you { border-color: rgba(202, 0, 2, 0.5); background: var(--you); }
        .sl__card--top { border-color: rgba(241, 195, 60, 0.5); background: var(--top-grad); }
        .sl__card-head { display: flex; align-items: center; gap: 10px; }
        .sl__card-rank { width: 34px; text-align: center; font-size: 18px; font-weight: 800; color: var(--muted); flex-shrink: 0; }
        .sl__card-id { flex: 1; min-width: 0; }
        .sl__card-name { font-size: 15px; font-weight: 700; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 6px; }
        .sl__card-sub { font-size: 12px; color: var(--subtle); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sl__card-amount { font-size: 16px; font-weight: 800; color: var(--amount); flex-shrink: 0; }
        .sl__card-div { height: 1px; background: var(--line); margin: 10px 0 8px; }
        .sl__card-stats { display: flex; justify-content: space-around; }
        .sl__card-stat { text-align: center; }
        .sl__card-stat-val { font-size: 15px; font-weight: 800; color: var(--text); }
        .sl__card-stat-lbl { font-size: 11px; color: var(--subtle); margin-top: 2px; }
      `}</style>
    </div>
  );
}
