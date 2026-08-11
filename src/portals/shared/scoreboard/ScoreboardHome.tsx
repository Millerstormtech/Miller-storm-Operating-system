import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../../../contexts/AuthContext";
import type { Window } from "../../../lib/acculynx/windows";
import type { ScopeLevel, Totals } from "../../../lib/scoreboard/types";
import type { Dir } from "../../../lib/scoreboard/metrics";
import {
  fmtMoney,
  fmtCount,
  formatSyncedAt,
  scopeLine,
  unresolvedScopeMessage,
  contractsSubtitle,
} from "../../../lib/scoreboard/display";
import { MetricTile } from "./MetricTile";
import { RankStrip } from "./RankStrip";
// ConversionStrip is deliberately not imported: see the note where it used to
// render, further down this file.
import { MarketingHome } from "./MarketingHome";

// The three-period toggle deliberately excludes "day" even though the API's
// Window type supports it (spec §5: "Week / Month / Year, defaulting to Month").
type ToggleWindow = "week" | "month" | "year";

interface TrendPayload {
  pct: number | null;
  dir: Dir;
}

interface ConversionPayload {
  rate: number;
  hidden: boolean;
  dir: Dir;
}

// Mirrors exactly what pages/api/scoreboard.ts returns for a sales/manager/
// branch-manager/c-level viewer (the non-variant branch).
interface ScoreboardData {
  window: Window;
  syncedAt: string | null;
  scope: { level: ScopeLevel; label: string; count: number; resolved: boolean };
  totals: Totals;
  previous: Totals;
  trends: { revenue: TrendPayload; knocks: TrendPayload; claims: TrendPayload };
  conversions: { knockToClaim: ConversionPayload; claimToContract: ConversionPayload };
  contracts: number;
  rank: { rank: number; of: number } | null;
  pace: number;
  goals: { revenue: number | null; knocks: number | null; claims: number | null };
  personal: Totals | null;
}

// Marketing and admin never get a sales roll-up: the endpoint intercepts them
// before resolveScope and returns just this shape instead.
interface ScoreboardVariantResponse {
  variant: "marketing" | "admin";
  scoreboard: null;
}

interface ScoreboardBoardResponse extends ScoreboardData {
  variant?: undefined;
}

type ScoreboardApiResponse = ScoreboardVariantResponse | ScoreboardBoardResponse;

// One route per role to "the full Sales Leaderboard" -- there is no single
// shared leaderboard path, each portal already has its own (sales/manager use
// "rankings", branch-manager/c-level use "sales-leaderboard"). Marketing and
// admin never reach the code that reads this map (they return early on
// `variant` above), so no entry is invented for them.
const LEADERBOARD_ROUTE: Record<string, string> = {
  sales: "/sales/rankings",
  "sales-team-lead": "/manager/rankings",
  "branch-manager": "/branch-manager/sales-leaderboard",
  "c-level": "/c-level/sales-leaderboard",
};

const WINDOW_OPTIONS: Array<{ value: ToggleWindow; label: string }> = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

const CARD = {
  background: "var(--surface-default)",
  border: "1px solid var(--border-default)",
  borderRadius: 12,
};

/**
 * The Scoreboard home screen every non-admin role lands on after login. Fetches
 * /api/scoreboard once (and again on every period-toggle change) and renders
 * the same frame for every role -- the API's `scope` field is what differs
 * between a rep, a team lead, a branch manager and a c-level exec, not the
 * layout. Every calculation and conditional-copy decision (formatting,
 * "enough data" judgements, the scope headcount line, the sync-freshness
 * note) is delegated to src/lib/scoreboard/display.ts so it stays covered by
 * tests -- this component only decides layout and which pre-computed piece
 * to show where.
 */
export function ScoreboardHome(): JSX.Element {
  const { user } = useAuth();
  const router = useRouter();

  const [windowSel, setWindowSel] = useState<ToggleWindow>("month");
  const [data, setData] = useState<ScoreboardApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  // One fetch per window change (or manual retry after a failure). A cancelled
  // flag drops a stale response if the window changes again before an earlier
  // request resolves, so a slow "Year" fetch can never overwrite a newer
  // "Week" answer -- same pattern as CourseView.tsx in training-leaderboard/.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    // Send the current viewer's id so an admin using "View As" gets the REP's
    // scoreboard (the server honors userId only for admins; for everyone else
    // it's their own id, a no-op). Without this, View As shows the admin's own
    // token identity -> the "admins have no metrics" message.
    fetch(`/api/scoreboard?window=${windowSel}&userId=${encodeURIComponent(user?.id || "")}`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((json: ScoreboardApiResponse) => {
        if (cancelled) return;
        setData(json);
      })
      .catch((e) => {
        // A cancelled request (the window changed again, or the component
        // unmounted, before this one resolved) is not a real failure -- logging
        // it would print a spurious error every time a user toggles quickly.
        if (!cancelled) {
          console.error(e);
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [windowSel, retryNonce, user?.id]);

  const firstName = (user?.name || "").trim().split(/\s+/)[0] || "there";
  const goToGoals = () => router.push("/sales/plan");
  const retry = () => setRetryNonce((n) => n + 1);

  // `data` is kept across refetches (the effect never clears it before a new
  // response lands), so once the FIRST successful load has happened, `data`
  // being non-null does not mean "the current request finished" -- it means
  // "we have at least one answer to show." That distinction is exactly what
  // separates the two loading/error states below: the full-page ones (nothing
  // has ever loaded) vs. the in-region ones further down (something loaded
  // before, a newer request for a different window is in flight or failed).
  const hasData = data !== null;

  // Honest full-page loading state: only for the very first load, when there
  // is nothing on screen yet to preserve. No zeros, no placeholder frame.
  if (!hasData && loading) {
    return (
      <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 14 }}>Loading your scoreboard…</div>
    );
  }

  // Honest full-page error state: covers a failed first load and the
  // defensive "loading finished but nothing arrived" case. Never falls
  // through to rendering zeros. Retry re-runs the fetch effect (no full page
  // reload) by bumping retryNonce.
  if (!hasData) {
    return (
      <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 14 }}>
        Couldn't load your scoreboard.{" "}
        <button
          type="button"
          onClick={retry}
          style={{
            border: "none",
            background: "none",
            color: "#2563eb",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 700,
            padding: 0,
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (data.variant) {
    // Marketing and admin both get an honest empty-state variant instead of
    // the sales rollup below -- pages/api/scoreboard.ts intercepts them
    // before scope resolution (spec §11: marketing doesn't sell and has no
    // org-chart subtree; admin dashboard work is explicitly out of scope for
    // this phase). The two roles are NOT told the same thing: "marketing
    // metrics aren't connected yet" is a specific, checkable, false claim
    // about an admin account, which has no marketing metrics to be
    // disconnected from in the first place. This nested check (rather than
    // two sibling `if (data.variant === ...)` checks) is deliberate --
    // `variant` is itself a two-value union ("marketing" | "admin"), so
    // TypeScript can only narrow `data` down to the plain board-response
    // shape for the `board = data` code below via the single outer truthy
    // check, not via two separate literal-equality checks against it.
    if (data.variant === "marketing") {
      return <MarketingHome firstName={firstName} />;
    }
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)" }}>Hi, {firstName}</div>
        <div style={{ fontSize: 14, color: "var(--text-muted)" }}>
          Admin accounts don't have scoreboard metrics of their own to show.
        </div>
      </div>
    );
  }

  const board = data;

  // A team/branch scope that never matched the org chart is NOT the same
  // state as "this team/branch genuinely has zero contributors": scopeRows()
  // (rollup.ts) requires a non-null team/branch key, so an unresolved scope
  // and a real empty one both produce inScope = [] server-side -- count alone
  // cannot tell them apart. Rendering the normal frame here would show
  // "Branch not identified · 0 people contributed" plus a full page of real-
  // looking $0/0/0 tiles, which is a false claim about the business (it says
  // "nobody sold anything" when the true state is "we don't know whose
  // numbers these should be"). This replaces the whole scope-line-and-below
  // region with an honest explanation instead. Greeting stays -- it comes
  // from the session, not from this scope resolution -- and the toggle stays
  // mounted too (every window hits the same unresolved scope, so nothing
  // about switching periods would help, but it costs nothing to leave live).
  const scopeUnresolved =
    (board.scope.level === "team" || board.scope.level === "branch") && !board.scope.resolved;

  const scopeText = scopeLine(board.scope);
  const leaderboardHref = user?.role ? LEADERBOARD_ROUTE[user.role] : undefined;

  // The data region: everything actually driven by the fetched totals/goals/
  // conversions. Kept separate from the frame below (greeting, rank strip,
  // toggle, scope line) so a window-toggle refetch blanks ONLY this part --
  // the toggle a user just clicked, and their rank/scope context, stay on
  // screen the whole time instead of the page flashing to a bare loading
  // line and back (this endpoint runs two full aggregation pipelines, so
  // that flash would be slow on every single click).
  let dataRegion: JSX.Element;
  if (scopeUnresolved) {
    dataRegion = (
      <div style={{ fontSize: 14, color: "var(--text-muted)" }}>
        {unresolvedScopeMessage(board.scope.level === "team" ? "team" : "branch")}
      </div>
    );
  } else if (loading) {
    // A refetch is in flight for a window we've already shown data for once.
    // Never keep last window's tiles under the newly-selected toggle label
    // (a stale "vs last month" trend under a freshly-clicked "Year" tab would
    // be a real mislabel) -- but ALSO never blank the whole screen for it.
    dataRegion = (
      <div style={{ padding: 16, color: "var(--text-subtle)", fontSize: 13 }}>Updating your numbers…</div>
    );
  } else if (error) {
    dataRegion = (
      <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13 }}>
        Couldn't update your numbers.{" "}
        <button
          type="button"
          onClick={retry}
          style={{
            border: "none",
            background: "none",
            color: "#2563eb",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 700,
            padding: 0,
          }}
        >
          Try again
        </button>
      </div>
    );
  } else {
    dataRegion = (
      <>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          <MetricTile
            label="Revenue"
            value={board.totals.revenue}
            format="money"
            subtitle={contractsSubtitle(board.contracts)}
            goal={board.goals.revenue}
            pace={board.pace}
            trend={board.trends.revenue}
            window={board.window}
            onSetGoal={goToGoals}
          />
          <MetricTile
            label="Verified Door Knocks"
            value={board.totals.knocks}
            format="count"
            goal={board.goals.knocks}
            pace={board.pace}
            trend={board.trends.knocks}
            window={board.window}
            onSetGoal={goToGoals}
          />
          <MetricTile
            label="Claims Filed"
            value={board.totals.claims}
            format="count"
            goal={board.goals.claims}
            pace={board.pace}
            trend={board.trends.claims}
            window={board.window}
            onSetGoal={goToGoals}
          />
        </div>

        {/* The knock-to-claim / claim-to-contract strip used to render here.
            Jay pulled it on the 2026-08-07 call: "Take that out for right now
            ... I just really want to look at absolute numbers and I don't want
            to make this super confusing ... let's just keep it clean with
            claims, verified door knocks and contract amounts."

            This is a METHODOLOGY HOLD, not a rejection: he and Mo are still
            settling how the rate should be computed (they are weighing trimming
            the most recent 30 days to account for attribution lag). So
            ConversionStrip.tsx and src/lib/leaderboard/conversion.ts stay put,
            tested and registered, exactly as the leaderboard version was left
            in PR #43. Bringing it back should be a revert of this commit, not a
            rebuild. Do not "fix" its absence by re-adding it. */}

        {/* "You (personal)" strip: only present when the API decided this viewer
            both leads a wider scope AND personally sells (see scoreboard.ts's
            `personal` derivation). Numbers only, deliberately no goal bar (spec
            §8: a leader's goal bar belongs to the scope they own, not their own
            production), so this does not reuse MetricTile. */}
        {board.personal && (
          <div style={{ ...CARD, padding: "12px 16px" }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              You (personal)
            </div>
            <div style={{ display: "flex", gap: 24, marginTop: 6, flexWrap: "wrap" }}>
              <PersonalNumber label="Revenue" value={fmtMoney(board.personal.revenue)} />
              <PersonalNumber label="Verified Door Knocks" value={fmtCount(board.personal.knocks)} />
              <PersonalNumber label="Claims Filed" value={fmtCount(board.personal.claims)} />
            </div>
          </div>
        )}

        <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>{formatSyncedAt(board.syncedAt, new Date())}</div>

        {leaderboardHref && (
          <button
            type="button"
            onClick={() => router.push(leaderboardHref)}
            style={{
              alignSelf: "flex-start",
              border: "none",
              background: "none",
              padding: 0,
              color: "#2563eb",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Full Sales Leaderboard
          </button>
        )}
      </>
    );
  }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, maxWidth: 960 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)" }}>Hi, {firstName}</div>

      <RankStrip rank={board.rank} scopeLevel={board.scope.level} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {WINDOW_OPTIONS.map((opt) => {
          const active = windowSel === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setWindowSel(opt.value)}
              aria-pressed={active}
              style={{
                padding: "6px 16px",
                borderRadius: 999,
                border: `1px solid ${active ? "var(--gray-900) /* no semantic: gray-900 as border */" : "var(--border-default)"}`,
                background: active ? "var(--surface-inverse)" : "var(--surface-default)",
                color: active ? "var(--text-inverse)" : "var(--text-tertiary)",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {!scopeUnresolved && scopeText && <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{scopeText}</div>}

      {dataRegion}
    </div>
  );
}

function PersonalNumber(props: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-subtle)" }}>{props.label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>{props.value}</div>
    </div>
  );
}
