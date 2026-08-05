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
  contractsSubtitle,
} from "../../../lib/scoreboard/display";
import { MetricTile } from "./MetricTile";
import { RankStrip } from "./RankStrip";
import { ConversionStrip } from "./ConversionStrip";

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
  scope: { level: ScopeLevel; label: string; count: number };
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
  background: "#fff",
  border: "1px solid #e5e7eb",
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
    fetch(`/api/scoreboard?window=${windowSel}`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((json: ScoreboardApiResponse) => {
        if (cancelled) return;
        setData(json);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [windowSel, retryNonce]);

  const firstName = (user?.name || "").trim().split(/\s+/)[0] || "there";
  const goToGoals = () => router.push("/sales/plan");

  // Honest loading state: no zeros, no stale numbers left on screen under a
  // freshly-selected period label that no longer matches them. Covers both
  // the very first load and every window-toggle refetch.
  if (loading) {
    return (
      <div style={{ padding: 24, color: "#6b7280", fontSize: 14 }}>Loading your scoreboard…</div>
    );
  }

  // Honest error state: never falls through to rendering zeros. Retry re-runs
  // the fetch effect (no full page reload) by bumping retryNonce.
  if (error || !data) {
    return (
      <div style={{ padding: 24, color: "#6b7280", fontSize: 14 }}>
        Couldn't load your scoreboard.{" "}
        <button
          type="button"
          onClick={() => setRetryNonce((n) => n + 1)}
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
    // Marketing and admin get their own honest empty-state variant
    // (spec §11, dedicated MarketingHome component -- a separate task on this
    // same plan). That component does not exist on this branch yet, so this
    // is a minimal, equally honest stand-in: no invented numbers, no fake
    // percentages, just a plain statement of the real state. Replace this
    // branch with `<MarketingHome />` once that component lands.
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>Hi, {firstName}</div>
        <div style={{ fontSize: 14, color: "#6b7280" }}>
          Marketing metrics aren't connected to a data source yet.
        </div>
      </div>
    );
  }

  const board = data;
  const scopeText = scopeLine(board.scope);
  const leaderboardHref = user?.role ? LEADERBOARD_ROUTE[user.role] : undefined;

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, maxWidth: 960 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>Hi, {firstName}</div>

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
                border: `1px solid ${active ? "#111827" : "#e5e7eb"}`,
                background: active ? "#111827" : "#fff",
                color: active ? "#fff" : "#374151",
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

      {scopeText && <div style={{ fontSize: 13, color: "#6b7280" }}>{scopeText}</div>}

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

      <ConversionStrip
        knockToClaim={board.conversions.knockToClaim}
        claimToContract={board.conversions.claimToContract}
      />

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
              color: "#6b7280",
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

      <div style={{ fontSize: 12, color: "#9ca3af" }}>{formatSyncedAt(board.syncedAt, new Date())}</div>

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
    </div>
  );
}

function PersonalNumber(props: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#9ca3af" }}>{props.label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>{props.value}</div>
    </div>
  );
}
