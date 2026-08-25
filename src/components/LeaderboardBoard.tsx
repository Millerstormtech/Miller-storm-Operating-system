// src/components/LeaderboardBoard.tsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { BRANCHES, BRANCH_ORDER } from "../lib/repcard/branches";
import { NO_VALUE, matchesSelection, selectedNames, selectionChipLabel } from "../lib/leaderboard/filters";
import { TEAM_NAMES, TEAM_LEADS } from "../lib/repcard/org-chart";
import { GuidedTour } from "../portals/shared/guided-tour/GuidedTour";
import { SALES_LEADERBOARD_TOUR } from "../portals/shared/guided-tour/definitions/salesLeaderboard";
import { compareStanding } from "../lib/leaderboard/ranking";
import { isFormerRep, buildRepOptions, stripFormerMarker } from "../lib/leaderboard/formerRep";
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
// YTD podium places. Keyed by place number rather than array index so the
// medal a rep is wearing can never drift from the number printed on it.
const PLACE_KEY: Record<number, string> = { 1: "gold", 2: "silver", 3: "bronze" };
const PLACE_LABEL: Record<number, string> = { 1: "Gold", 2: "Silver", 3: "Bronze" };

const WINDOWS: { key: Window; label: string }[] = [
  { key: "day", label: "Today" },
  { key: "week", label: "Week to Date" },
  { key: "month", label: "Month to Date" },
  { key: "year", label: "Year to Date" },
];

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n ?? 0);

// Branch and Team are multi-select: an EMPTY selection means "show all", and
// NO_VALUE is the checkbox for rows missing that field. Both the matching and the
// labelling live in lib/leaderboard/filters.ts, shared with the PDF export.

// Column definitions drive both the header row and the click-to-sort behavior.
type SortKey = "name" | "branch" | "team" | "verifiedKnocks" | "leadsCreated" | "filed" | "won" | "revenue";
type ColType = "text" | "num" | "money";
// `short` is the phone label: the card view's sort chips have to fit a 390px
// screen, so they use these instead of the full table-header wording.
const COLUMNS: { key: SortKey; label: string; short: string; type: ColType }[] = [
  { key: "name", label: "Rep", short: "Rep", type: "text" },
  { key: "branch", label: "Branch", short: "Branch", type: "text" },
  { key: "team", label: "Team", short: "Team", type: "text" },
  { key: "verifiedKnocks", label: "Verified Door Knocks", short: "Knocks", type: "num" },
  { key: "leadsCreated", label: "Leads Created", short: "Leads", type: "num" },
  { key: "filed", label: "Claims Filed", short: "Claims Filed", type: "num" },
  { key: "won", label: "Contracts", short: "Contracts", type: "num" },
  { key: "revenue", label: "Contract Amount", short: "Amount", type: "money" },
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
  // YTD Top Sales: the year's gold, silver and bronze. Its own year window
  // server-side, so it means the same thing whatever period the table shows.
  // Fewer than three entries when fewer than three reps have earned anything.
  const [ytdPodium, setYtdPodium] = useState<
    Array<{
      place: number; id: string; name: string; revenue: number;
      behindBy: number | null; behindName: string | null; headshotUrl: string;
    }>
  >([]);
  const [contractKing, setContractKing] = useState<
    { id: string; name: string; revenue: number; headshotUrl: string; monthLabel: string } | null
  >(null);

  /** Which YTD place a rep holds ("Gold"/"Silver"/"Bronze"), or null. */
  const ytdCrownFor = useCallback(
    (id: string) => {
      const place = ytdPodium.find((p) => p.id === id);
      return place ? PLACE_LABEL[place.place] || null : null;
    },
    [ytdPodium]
  );

  // Filters + sort (all applied client-side over the fetched rows).
  // Branch and Team multi-select. Empty set = no filter. Unlike the Rep filter
  // these apply as you tick: the lists are short enough that a draft/apply step
  // would be friction rather than protection.
  const [branchSel, setBranchSel] = useState<Set<string>>(new Set());
  const [teamSel, setTeamSel] = useState<Set<string>>(new Set());
  const [branchOpen, setBranchOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
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
        setYtdPodium(data.ytdPodium ?? []);
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

  // Tick / untick one value in a multi-select. Always builds a new Set so React
  // sees the change; mutating in place would leave the table stale.
  const toggleIn = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (v: string) =>
    setter((prev) => { const n = new Set(prev); if (n.has(v)) n.delete(v); else n.add(v); return n; });
  const toggleBranch = toggleIn(setBranchSel);
  const toggleTeam = toggleIn(setTeamSel);

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

  // Selected values as display names, in canonical order. Shared with the PDF via
  // the same helpers, so an export can never name a scope the screen was not showing.
  const branchNames = useMemo(() => selectedNames(branchSel, BRANCH_ORDER, "(No branch)"), [branchSel]);
  const teamNames = useMemo(
    () => selectedNames(teamSel, {}, "(No team)").map((t) => TEAM_LEADS[t] || t),
    [teamSel]
  );

  // Every rep on the board (stable across windows -> roster = all active reps), for the
  // Rep multi-select. De-duplicated by id; current reps first (A-Z), then former reps
  // (A-Z), and former reps dropped entirely while "Hide former reps" is on so the filter
  // never offers someone the board is refusing to show. Ordering lives in formerRep.ts:
  // a plain name sort pinned the departed reps to the TOP, because the cross mark in
  // their synced RepCard name sorts ahead of every letter.
  const repList = useMemo(() => buildRepOptions(rows, { hideFormer }), [rows, hideFormer]);

  const visible = useMemo(() => {
    // Row filtering only. Since branch reporting became team-based, a branch
    // filter selects reps and never rewrites a number, so a rep's row reads the
    // same whichever filters are on. The old code rewrote every metric here.
    const filtered = rows.filter((r: any) => {
      // "Hide former reps" toggle. isFormerRep() reads BOTH signals (RepCard's
      // status flag and a cross mark in the synced name), the same call the Rep
      // dropdown makes, so the table and the dropdown can never disagree about
      // who has left. Rank is unaffected: this only hides rows.
      if (hideFormer && isFormerRep(r)) return false;
      if (appliedReps.size > 0 && !appliedReps.has(r.id)) return false; // Rep multi-select
      if (!matchesSelection(r.branch, branchSel)) return false;
      if (!matchesSelection(r.team, teamSel)) return false;
      return true;
    });

    const col = COLUMNS.find((c) => c.key === sortKey);
    const dir = sortDir === "asc" ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      // Sort the Rep column on the name as DISPLAYED (marker stripped). The raw
      // name can start with a cross mark, which sorts ahead of every letter, so
      // sorting it raw would scatter former reps to the top of an A-Z list for
      // no reason the reader can see, now that the marker is a separate badge.
      const text = (r: any) => (sortKey === "name" ? stripFormerMarker(String(r.name ?? "")) : String(r[sortKey] ?? ""));
      const primary = col?.type === "text"
        ? text(a).localeCompare(text(b)) * dir
        : ((a[sortKey] ?? 0) - (b[sortKey] ?? 0)) * dir;
      // On any tie in the clicked column, fall back to overall standing (Contract
      // Amount -> Contracts -> Claims Filed -> Leads Created -> Verified Door Knocks).
      return primary || compareStanding(a, b);
    });
    return sorted;
  }, [rows, branchSel, teamSel, appliedReps, sortKey, sortDir, hideFormer]);

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

  // Under team-based reporting every listed rep really does belong to the filtered
  // branch, so Branch and Team no longer contradict the filter and both columns stay.
  // Team in particular is the useful one here: it splits a branch into its team leads.
  // (They used to be hidden, back when a filter could list an out-of-branch rep for
  // the sales they happened to file in this branch.)
  const visibleColumns = COLUMNS;

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
      branches: [...branchSel],
      teams: [...teamSel],
      selectedRepCount: appliedReps.size,
      hideFormer,
      rowCount: scope === "view" ? visible.length : boardRows.length,
    }),
    [periodLabel, from, to, branchSel, teamSel, appliedReps, hideFormer, visible.length, boardRows.length]
  );

  const toExportRow = (r: any): SalesExportRow => ({
    id: r.id,
    // Mirror the screen: marker drawn from the status flag, not from whatever the
    // synced name happens to carry. A PDF outlives the screen it came from, so it
    // must not disagree with it about who has left.
    name: `${isFormerRep(r) ? "❌ " : ""}${stripFormerMarker(r.name)}`,
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
        {/* Total revenue for the selected period — recomputes with the date
            filter (and any active branch/team/rep filters) since it sums the
            visible rows. */}
        <div className="sl__total" title="Total contract amount for the selected period">
          <div className="sl__total-label">Total Revenue</div>
          <div className="sl__total-val">{fmtMoney(totals.revenue)}</div>
        </div>
      </div>

      {/* YTD Top Sales: the year's podium, with the monthly Contract King on its
          own bar underneath, both inside one plate so they read as one object.
          Approved 2026-08-15; design in docs/design/2026-08-13-ytd-king.

          FIRST on the page and ALWAYS shown (Youssef, 2026-08-15). It must never
          respond to a filter: the branch, team, rep and former-rep filters are
          client-side and are applied to `rows` alone, never to this, and the
          server computes both the podium and the crown on their own year and
          month windows rather than the selected period. Do not move this inside
          the `loading` guard either, or it will blink out every time a period
          pill is pressed.

          The podium renders only the places that exist, so the first days of a
          year show one card rather than two empty medals. The plate itself is
          drawn whenever EITHER exists, so the monthly king never loses its bar
          just because nobody has earned a year place yet. */}
      {(ytdPodium.length > 0 || contractKing) && (
        <div className="sl__podium" data-tour="ytd-podium">
          {ytdPodium.length > 0 && (
            <>
              <div className="sl__podium-title">YTD Top Sales</div>
              <div className="sl__podium-row">
                {ytdPodium.map((p) => (
                  <div key={p.id} className={`sl__pod sl__pod--${PLACE_KEY[p.place] || "gold"}`}>
                    <div className="sl__pod-place">
                      <span className="sl__pod-medal">{p.place}</span>
                      {PLACE_LABEL[p.place] || ""}
                    </div>
                    <RepAvatar name={stripFormerMarker(p.name)} url={p.headshotUrl} size={54} fontSize={21} />
                    <div className="sl__pod-name">{stripFormerMarker(p.name)}</div>
                    <div className="sl__pod-amt">{fmtMoney(p.revenue)}</div>
                    <div className="sl__pod-gap">
                      {p.behindBy === null
                        ? "Leads the company"
                        : <>Behind {stripFormerMarker(p.behindName)} by <b>{fmtMoney(p.behindBy)}</b></>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Contract King: this month's top rep by Contract Amount. */}
          {contractKing && (
            <div className="sl__king" data-tour="contract-king">
              <div className="sl__king-eyebrow">&#128081; {contractKing.monthLabel.toUpperCase()} CONTRACT KING</div>
              {/* A departed rep can still have topped the month, so the bar strips
                  the marker the same way the Storm Chat announcement does: this is a
                  celebration, and "❌ Waylon Marked" reads as a rendering glitch. */}
              <div className="sl__king-name">{stripFormerMarker(contractKing.name)}</div>
              <div className="sl__king-amount">{fmtMoney(contractKing.revenue)}</div>
            </div>
          )}
        </div>
      )}

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
        {/* Branch and Team: tick any number. Applies on tick, no Apply button,
            because both lists are short. Clicking away closes the panel. */}
        <div className="sl__rep-wrap">
          <button type="button" className="sl__chip" onClick={() => { setBranchOpen((o) => !o); setTeamOpen(false); }}>
            {selectionChipLabel(branchNames, "All branches", "branches")} ▾
          </button>
          {branchOpen ? (
            <>
              <div onClick={() => setBranchOpen(false)} className="sl__overlay" />
              <div className="sl__rep-panel sl__rep-panel--short">
                <div className="sl__rep-list">
                  {branchOptions.list.map((b) => (
                    <label key={b} className="sl__rep-item">
                      <input type="checkbox" checked={branchSel.has(b)} onChange={() => toggleBranch(b)} />
                      {b}
                    </label>
                  ))}
                  {branchOptions.hasBlank ? (
                    <label className="sl__rep-item">
                      <input type="checkbox" checked={branchSel.has(NO_VALUE)} onChange={() => toggleBranch(NO_VALUE)} />
                      (No branch)
                    </label>
                  ) : null}
                </div>
                <div className="sl__rep-actions">
                  <button onClick={() => setBranchSel(new Set())} className="sl__link">Clear</button>
                  <button onClick={() => setBranchOpen(false)} className="sl__apply">Done</button>
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="sl__rep-wrap">
          <button type="button" className="sl__chip" onClick={() => { setTeamOpen((o) => !o); setBranchOpen(false); }}>
            {selectionChipLabel(teamNames, "All teams", "teams")} ▾
          </button>
          {teamOpen ? (
            <>
              <div onClick={() => setTeamOpen(false)} className="sl__overlay" />
              <div className="sl__rep-panel sl__rep-panel--short">
                <div className="sl__rep-list">
                  {teamOptions.list.map((t) => (
                    <label key={t} className="sl__rep-item">
                      <input type="checkbox" checked={teamSel.has(t)} onChange={() => toggleTeam(t)} />
                      {TEAM_LEADS[t] || t}
                    </label>
                  ))}
                  {teamOptions.hasNone ? (
                    <label className="sl__rep-item">
                      <input type="checkbox" checked={teamSel.has(NO_VALUE)} onChange={() => toggleTeam(NO_VALUE)} />
                      (No team)
                    </label>
                  ) : null}
                </div>
                <div className="sl__rep-actions">
                  <button onClick={() => setTeamSel(new Set())} className="sl__link">Clear</button>
                  <button onClick={() => setTeamOpen(false)} className="sl__apply">Done</button>
                </div>
              </div>
            </>
          ) : null}
        </div>

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
                      {rp.former ? <span aria-label="Former rep">❌</span> : null}
                      {/* Already stripped by buildRepOptions, which sorts on this
                          same text so the order matches what is read here. */}
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

        {(branchSel.size || teamSel.size || appliedReps.size || hideFormer) ? (
          <button className="sl__chip" onClick={() => { setBranchSel(new Set()); setTeamSel(new Set()); setAppliedReps(new Set()); setHideFormer(false); }}>
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

      {!isCustom && window === "week" && (
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: -6, marginBottom: 14 }}>
          Resets Mondays at 12:00 AM CT.
        </div>
      )}

      {branchNames.length > 0 ? (
        <div className="sl__note">
          Showing <strong>{branchNames.join(", ")}</strong>. Every rep on these teams is listed with their full numbers, including any jobs they ran in another branch while storm-chasing.
        </div>
      ) : null}

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
                        {/* Stripped: RepAvatar falls back to the name's first character
                            when there is no headshot, so a marker baked into the synced
                            name renders "❌" as the initial instead of the rep's letter. */}
                        <RepAvatar name={stripFormerMarker(r.name)} url={r.headshotUrl} size={26} />
                        {r.source === "repcard" ? <span title="No AccuLynx account" className="sl__dot" /> : null}
                        {/* The ❌ is DRAWN here, from the rep's RepCard status. It used to
                            arrive only as literal characters inside the name, which meant a
                            rep deactivated after their last door knock never showed one: the
                            board renders the name snapshotted on the day of that knock, and
                            that snapshot is frozen once they stop knocking. Painting it from
                            the status flag makes the legend below true for every former rep
                            the moment RepCard deactivates them. */}
                        {isFormerRep(r) ? (
                          <span title="Former rep (deactivated in RepCard)" aria-label="Former rep">❌</span>
                        ) : null}
                        {/* Strip any marker already baked into the synced name so reps whose
                            snapshot DOES carry one do not end up with two. */}
                        <span className="sl__rep-name">{stripFormerMarker(r.name)}{isYou ? " (You)" : ""}</span>
                        {/* Two crowns now exist and must be told apart at this
                            size. The year crown is a gold ring around the same
                            glyph; the month crown is the bare glyph. Shape
                            carries the meaning and weight carries the rank, so
                            the pair still reads in greyscale. A rep who holds
                            both (common: the year leader is often also the
                            month leader) shows both. */}
                        {ytdCrownFor(r.id) ? (
                          <span
                            className="sl__crown-year"
                            title={`${ytdCrownFor(r.id)} in YTD Top Sales`}
                          >
                            &#128081;
                          </span>
                        ) : null}
                        {contractKing && r.id === contractKing.id ? (
                          <span title={`Top Contract Amount this month (${contractKing.monthLabel})`}>&#128081;</span>
                        ) : null}
                      </span>
                    </td>
                    <td className="sl__muted">{r.branch || "—"}</td>
                    <td className="sl__muted">{TEAM_LEADS[r.team] || r.team || "—"}</td>
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
                  <td colSpan={4} className="sl__foot-label">
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
          {/* Cards have no column headers to click, so sorting gets its own
              control here. Same onSort as the table: tapping the active chip
              flips direction, so both views behave identically. */}
          <div className="sl__sortbar" role="group" aria-label="Sort reps by">
            <span className="sl__sortbar-lbl">Sort</span>
            <div className="sl__sortbar-chips">
              {/* Metric columns (Knocks, Claims Filed, Contracts, Amount, Leads)
                  first so they're visible without scrolling; Rep/Branch/Team last.
                  This is the mobile equivalent of clicking a column on the web. */}
              {[...visibleColumns]
                .sort((a, b) => (a.type === "text" ? 1 : 0) - (b.type === "text" ? 1 : 0))
                .map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => onSort(c.key)}
                    aria-pressed={c.key === sortKey}
                    className={`sl__sortchip${c.key === sortKey ? " sl__sortchip--on" : ""}`}
                  >
                    {c.short}{arrow(c.key)}
                  </button>
                ))}
            </div>
          </div>
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
                  <RepAvatar name={stripFormerMarker(r.name)} url={r.headshotUrl} size={44} fontSize={18} />
                  <div className="sl__card-id">
                    <div className="sl__card-name">
                      {r.source === "repcard" ? <span title="No AccuLynx account" className="sl__dot" /> : null}
                      {/* Same drawn-from-status marker as the table view above. */}
                      {isFormerRep(r) ? <span aria-label="Former rep">❌</span> : null}
                      {stripFormerMarker(r.name)}{isYou ? " (You)" : ""}
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
          --card-border: rgba(255, 255, 255, 0.06);  /* tokens-guard-ignore: bespoke-dark, widget's own dark palette */
          --text: #f4f4f6;
          --muted: #9aa0a6;
          --subtle: #7f858c;
          --line: rgba(255, 255, 255, 0.06);  /* tokens-guard-ignore: bespoke-dark, widget's own dark palette */
          --th: #8b9096;
          --th-bg: #0d0d0f;
          --th-active: #ff5a5c;
          --chip-bg: #1c1e22;
          --chip-border: rgba(255, 255, 255, 0.18);  /* tokens-guard-ignore: bespoke-dark, widget's own dark palette */
          --chip-text: #e7e8ea;
          --pill-text: #c7c9ce;
          --pill-border: rgba(255, 255, 255, 0.2);  /* tokens-guard-ignore: bespoke-dark, widget's own dark palette */
          --num: #e7e8ea;
          --amount: var(--text-inverse);
          --rank: #6b7075;
          --gold: #f1c33c;
          --panel: #141416;
          --panel-line: rgba(255, 255, 255, 0.12);  /* tokens-guard-ignore: bespoke-dark, widget's own dark palette */
          --hover: rgba(255, 255, 255, 0.03);  /* tokens-guard-ignore: bespoke-dark, widget's own dark palette */
          --you: rgba(202, 0, 2, 0.1);
          --top-grad: linear-gradient(90deg, rgba(202, 0, 2, 0.28), rgba(202, 0, 2, 0.04) 70%, transparent);
          --wm-op: 0.08;
          --note-bg: rgba(37, 99, 235, 0.12);
          --note-border: rgba(37, 99, 235, 0.35);
          --note-text: #bcd0ff;
          --rep-panel-bg: #1e2024;
          --rep-field-bg: rgba(255, 255, 255, 0.07);  /* tokens-guard-ignore: bespoke-dark, widget's own dark palette */
          --rep-hover: rgba(255, 255, 255, 0.07);  /* tokens-guard-ignore: bespoke-dark, widget's own dark palette */

          position: relative;
          background: var(--bg);
          border: 1px solid var(--card-border);
          border-radius: 18px;
          padding: 4px 24px 8px;
          color: var(--text);
          overflow: hidden;
          /* Render native form controls (Branch/Team selects, date inputs, the
             "hide former" checkbox) in dark so they don't flash white here. */
          color-scheme: dark;
        }
        /* Light theme — applied via a class the component sets from data-theme. */
        .sl.sl--light {
          color-scheme: light;
          --bg: transparent;
          --card-border: transparent;
          --text: #14161a;
          --muted: var(--text-muted);
          --subtle: #9aa3ad;
          --line: #eceef1;
          --th: var(--text-muted);
          --th-bg: #f6f7f9;
          --th-active: #ca0002;
          --chip-bg: var(--surface-default);
          --chip-border: #d8dbdf;
          --chip-text: var(--text-tertiary);
          --pill-text: #4b5563;
          --pill-border: #d8dbdf;
          --num: var(--text-secondary);
          --amount: var(--text-primary);
          --rank: #9aa3ad;
          --gold: #cf9412;
          --panel: var(--surface-default);
          --panel-line: var(--border-default);
          --hover: #f6f7f9;
          --you: rgba(202, 0, 2, 0.05);
          --top-grad: linear-gradient(90deg, rgba(202, 0, 2, 0.1), rgba(202, 0, 2, 0.02) 70%, transparent);
          --wm-op: 0.08;
          --note-bg: #eff6ff;
          --note-border: #bfdbfe;
          --note-text: #1e40af;
          --rep-panel-bg: var(--surface-default);
          --rep-field-bg: var(--surface-subtle);
          --rep-hover: var(--surface-subtle);
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

        .sl__total { text-align: right; padding: 10px 18px; border-radius: 14px; border: 1px solid var(--chip-border); background: var(--chip-bg); flex-shrink: 0; }
        .sl__total-label { font-size: 11px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: var(--muted); }
        .sl__total-val { margin-top: 3px; font-family: "Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif; font-size: clamp(24px, 3vw, 32px); font-weight: 900; line-height: 1; letter-spacing: 0.01em; color: #16a34a; }
        @media (max-width: 560px) { .sl__total { text-align: left; } }

        .sl__periods { display: flex; gap: 8px; flex-wrap: nowrap; flex-shrink: 0; justify-content: flex-start; }
        @media (max-width: 1100px) { .sl__periods { flex-wrap: wrap; } }
        .sl__pill { padding: 8px 14px; border-radius: 999px; cursor: pointer; font-size: 13px; font-weight: 600; white-space: nowrap; color: var(--pill-text); background: transparent; border: 1px solid var(--pill-border); transition: background 0.15s, color 0.15s, border-color 0.15s; }
        .sl__pill:hover { color: var(--text); }
        .sl__pill--on { background: linear-gradient(90deg, #b30002, #e01418); color: var(--text-inverse); border-color: transparent; box-shadow: 0 6px 18px rgba(202, 0, 2, 0.35); }

        .sl__custom { display: flex; gap: 16px; margin-bottom: 16px; font-size: 13px; color: var(--muted); flex-wrap: wrap; }
        .sl__date { margin-left: 6px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--chip-border); background: var(--chip-bg); color: var(--text); }

        .sl__banner { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; border-radius: 14px; padding: 16px 20px; margin-bottom: 16px; }
        .sl__banner--rank { background: linear-gradient(135deg, #1e3a8a, #2563eb); color: var(--text-inverse); box-shadow: 0 8px 24px rgba(37, 99, 235, 0.28); }
        .sl__banner-emoji { font-size: 34px; line-height: 1; }
        .sl__banner-main { flex: 1; min-width: 160px; }
        .sl__banner-eyebrow { font-size: 12px; opacity: 0.85; font-weight: 700; letter-spacing: 0.4px; }
        .sl__banner-title { font-size: 26px; font-weight: 800; margin-top: 2px; }
        .sl__banner-sub { font-size: 15px; font-weight: 600; opacity: 0.85; }
        .sl__banner-stats { display: flex; gap: 22px; text-align: right; }
        .sl__stat-val { font-size: 18px; font-weight: 800; }
        .sl__stat-lbl { font-size: 11px; opacity: 0.8; }

        /* YTD Top Sales plate. Fixed dark in both themes, the same precedent as
           the Contract King bar being fixed red: these are branded objects, not
           surfaces, so they deliberately do not follow the app theme.
           --text-inverse is used wherever text must stay white on that fixed
           dark ground, because it is the one token that does not flip. */
        .sl__podium { position: relative; border-radius: 16px; padding: 18px 18px 14px; margin-bottom: 18px; overflow: hidden; background: linear-gradient(168deg, #252A34 0%, #171A21 46%, #0F1218 100%); border: 1px solid rgb(var(--white-rgb) / 0.13); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.34); }
        .sl__podium-title { font-family: 'Arial Narrow', 'Roboto Condensed', sans-serif; font-size: 17px; font-weight: 800; letter-spacing: 2.6px; text-transform: uppercase; color: #8D96A6; margin-bottom: 12px; }
        .sl__podium-row { display: grid; grid-template-columns: 1fr; gap: 10px; }
        @media (min-width: 720px) { .sl__podium-row { grid-template-columns: repeat(3, 1fr); } }
        .sl__pod { position: relative; border-radius: 13px; padding: 14px 14px 12px; background: rgb(var(--white-rgb) / 0.038); border: 1px solid rgb(var(--white-rgb) / 0.11); display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; overflow: hidden; }
        /* The metal: a top edge band plus a tinted wash, so the three read as
           different materials rather than three colours of the same chip. */
        .sl__pod::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 4px; background: var(--metal); }
        .sl__pod::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: radial-gradient(120% 80% at 50% 0%, var(--wash) 0%, transparent 62%); }
        .sl__pod > * { position: relative; z-index: 1; }
        .sl__pod--gold { --metal: linear-gradient(90deg, #A9800F, #F4C542 48%, #A9800F); --wash: rgba(244, 197, 66, 0.16); }
        .sl__pod--silver { --metal: linear-gradient(90deg, #79828F, #D8DDE4 48%, #79828F); --wash: rgba(216, 221, 228, 0.10); }
        .sl__pod--bronze { --metal: linear-gradient(90deg, #7A4A22, #D89A62 48%, #7A4A22); --wash: rgba(216, 154, 98, 0.11); }
        .sl__pod-place { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 800; letter-spacing: 1.7px; text-transform: uppercase; }
        .sl__pod--gold .sl__pod-place { color: #F4C542; }
        .sl__pod--silver .sl__pod-place { color: #D8DDE4; }
        .sl__pod--bronze .sl__pod-place { color: #D89A62; }
        .sl__pod-medal { width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: 'Arial Narrow', 'Roboto Condensed', sans-serif; font-size: 12px; font-weight: 800; color: #2A2205; }
        .sl__pod--gold .sl__pod-medal { background: radial-gradient(circle at 50% 32%, #FFE27A, #E8B923 56%, #A9800F); }
        .sl__pod--silver .sl__pod-medal { background: radial-gradient(circle at 50% 32%, #F2F5F8, #C3CAD3 56%, #79828F); color: #20242B; }
        .sl__pod--bronze .sl__pod-medal { background: radial-gradient(circle at 50% 32%, #EFBE90, #C07C44 56%, #7A4A22); color: #2B1808; }
        .sl__pod-name { font-family: 'Arial Narrow', 'Roboto Condensed', sans-serif; font-size: 21px; font-weight: 800; line-height: 1.05; text-transform: uppercase; color: var(--text-inverse); }
        .sl__pod-amt { font-family: 'Arial Narrow', 'Roboto Condensed', sans-serif; font-size: 27px; font-weight: 800; color: #F0F2F5; font-variant-numeric: tabular-nums; }
        .sl__pod--gold .sl__pod-amt { font-size: 31px; color: #FFD65C; }
        .sl__pod-gap { font-size: 12px; line-height: 1.4; color: #98A1B0; border-top: 1px solid rgb(var(--white-rgb) / 0.10); padding-top: 8px; width: 100%; }
        .sl__pod-gap b { color: #E7EAEF; font-weight: 700; font-variant-numeric: tabular-nums; }
        .sl__pod--gold .sl__pod-gap { color: #F4C542; }

        /* The monthly crown now sits inside the plate as a bar, not as its own
           full-width red banner: the year race outranks it, and two competing
           red banners was the problem the design set out to solve. */
        .sl__king { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; background: rgba(202, 0, 2, 0.16); border: 1px solid rgba(202, 0, 2, 0.38); border-radius: 12px; padding: 11px 18px; margin-top: 10px; color: #F0F2F5; }
        /* Year crown: the same glyph in a gold ring. Shape carries the
           meaning, weight carries the rank, so the pair reads in greyscale. */
        .sl__crown-year { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid #F4C542; background: rgba(244, 197, 66, 0.16); font-size: 10px; line-height: 1; }
        .sl__king-eyebrow { font-size: 11px; letter-spacing: 1.6px; font-weight: 800; text-transform: uppercase; color: #FF8A85; }
        .sl__king-name { font-size: 15px; font-weight: 700; }
        .sl__king-amount { font-size: 17px; font-weight: 800; margin-left: auto; font-variant-numeric: tabular-nums; }

        /* Above the legend/table siblings so the "Search reps" dropdown isn't
           painted over by them (.sl > * pins every child to z-index 1). Must be
           written child-scoped: styled-jsx compiles .sl > * with more
           specificity than a bare .sl__filters, so a plain class rule here
           loses and the dropdown drops back to z-index 1. */
        .sl > .sl__filters { display: flex; gap: 9px; margin-bottom: 16px; flex-wrap: nowrap; align-items: center; position: relative; z-index: 50; }
        @media (max-width: 1100px) { .sl > .sl__filters { flex-wrap: wrap; } }
        .sl__chip { padding: 9px 14px; border-radius: 999px; border: 1px solid var(--chip-border); background: var(--chip-bg); color: var(--chip-text); font-weight: 600; font-size: 13px; cursor: pointer; }
        .sl__toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--pill-text); font-weight: 600; cursor: pointer; }
        .sl__rep-wrap { position: relative; display: inline-block; }
        .sl__overlay { position: fixed; inset: 0; z-index: 90; }
        .sl__rep-panel { position: absolute; z-index: 100; top: calc(100% + 6px); left: 0; width: 260px; background: var(--rep-panel-bg); border: 1px solid var(--panel-line); border-radius: 12px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45); padding: 10px; }
        .sl.sl--light .sl__rep-panel { box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18); }
        .sl__rep-search { width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--chip-border); background: var(--rep-field-bg); color: var(--text); margin-bottom: 8px; box-sizing: border-box; font-size: 13px; outline: none; }
        .sl__rep-search::placeholder { color: var(--subtle); }
        .sl__rep-list { max-height: 220px; overflow-y: auto; margin-bottom: 8px; }
        /* Branch/Team hold 4-7 short rows: narrower than the rep panel, and no
           inner scroll. Declared after the base rules so it wins on source order. */
        .sl__rep-panel--short { width: 200px; }
        .sl__rep-panel--short .sl__rep-list { max-height: none; overflow-y: visible; }
        .sl__rep-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; font-size: 13px; cursor: pointer; color: var(--text); }
        .sl__rep-item:hover { background: var(--rep-hover); }
        .sl__rep-actions { display: flex; justify-content: space-between; align-items: center; }
        .sl__link { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 12px; padding: 0; }
        .sl__apply { padding: 7px 14px; border-radius: 8px; border: none; background: linear-gradient(90deg, #b30002, #e01418); color: var(--text-inverse); font-weight: 700; cursor: pointer; font-size: 13px; }
        .sl__export :global(button) { border-radius: 999px !important; }
        .sl__count { font-size: 13px; color: var(--subtle); margin-left: auto; }

        .sl__note { margin-bottom: 12px; background: var(--note-bg); border: 1px solid var(--note-border); border-radius: 10px; padding: 9px 14px; font-size: 12.5px; color: var(--note-text); }
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

        /* Phone sort bar. Chips scroll sideways rather than wrapping, so the row
           stays one line no matter how many columns are visible. */
        .sl__sortbar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .sl__sortbar-lbl { flex-shrink: 0; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: var(--muted); }
        .sl__sortbar-chips { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; padding-bottom: 2px; }
        .sl__sortbar-chips::-webkit-scrollbar { display: none; }
        .sl__sortchip {
          flex-shrink: 0;
          padding: 7px 12px;
          border-radius: 999px;
          border: 1px solid var(--chip-border);
          background: var(--chip-bg);
          color: var(--chip-text);
          font-size: 12.5px;
          font-weight: 600;
          white-space: nowrap;
          cursor: pointer;
        }
        .sl__sortchip--on { background: linear-gradient(90deg, #b30002, #e01418); color: var(--text-inverse); border-color: transparent; }

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
