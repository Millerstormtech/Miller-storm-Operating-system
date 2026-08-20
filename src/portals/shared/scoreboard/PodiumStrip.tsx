import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { RepAvatar } from "../../../components/RepAvatar";
import { fmtMoney, fmtCount } from "../../../lib/scoreboard/display";

/**
 * "Who is winning" for the C-level dashboard: top three in sales and top three
 * in training, side by side under the metric tiles (asked for by Jay on the
 * 2026-08-20 call -- he wants the vital signs of the business without having to
 * open two more screens).
 *
 * THE TWO HALVES ANSWER DIFFERENT QUESTIONS AND ARE LABELLED DIFFERENTLY ON
 * PURPOSE.
 *
 * Sales follows the Week/Month/Year toggle, because every knock and every claim
 * carries its own date, so any range can be totalled after the fact.
 *
 * Training does NOT follow the toggle, and its caption says "All time" so the
 * difference is visible rather than looking like a bug. UserProgress stores
 * completedPages as a bare list of page ids with no dates (see
 * src/lib/models/UserProgress.ts), so there has never been a way to ask "who
 * did the most training in August". Dates are recorded going forward from
 * 2026-08-20 via pageCompletions, but they cannot be backfilled, so a genuine
 * period-based training board only becomes honest once a full period has
 * elapsed under the new recording. Until then, all-time is the only true
 * answer, and claiming otherwise would put a fabricated ranking in front of the
 * person who trusts it most.
 */

type ToggleWindow = "week" | "month" | "year";

interface SalesPlace {
  place: number;
  id: string;
  name: string;
  revenue: number;
  headshotUrl?: string;
}

interface TrainingPlace {
  id: string;
  name: string;
  headshotUrl?: string;
  itemsCompleted: number;
  rank: number | null;
  isPodium?: boolean;
  notStarted?: boolean;
}

const WINDOW_CAPTION: Record<ToggleWindow, string> = {
  week: "This week",
  month: "This month",
  year: "This year",
};

const CARD: React.CSSProperties = {
  background: "var(--surface-default)",
  border: "1px solid var(--border-default)",
  borderRadius: 12,
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  flex: "1 1 280px",
  minWidth: 0,
};

const MEDAL_BG: Record<number, string> = {
  1: "radial-gradient(circle at 40% 30%, #ffe488, #e8b923 58%, #b8860b)",
  2: "radial-gradient(circle at 40% 30%, #e9edf2, #b9c0c9 60%, #8b929c)",
  3: "radial-gradient(circle at 40% 30%, #f0b98a, #cd7f45 60%, #9a5a2c)",
};

export function PodiumStrip(props: { window: ToggleWindow }): JSX.Element {
  const { window: windowSel } = props;
  const router = useRouter();

  const [sales, setSales] = useState<SalesPlace[] | null>(null);
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesError, setSalesError] = useState(false);

  const [training, setTraining] = useState<TrainingPlace[] | null>(null);
  const [trainingError, setTrainingError] = useState(false);

  // Sales refetches on every toggle change. Same cancelled-flag guard as
  // ScoreboardHome: a slow "year" response must never overwrite a newer "week"
  // one and leave the year's podium sitting under a "This week" caption.
  useEffect(() => {
    let cancelled = false;
    setSalesLoading(true);
    setSalesError(false);
    fetch(`/api/scoreboard/podiums?window=${windowSel}`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((json: { sales: SalesPlace[] }) => {
        if (cancelled) return;
        setSales(Array.isArray(json.sales) ? json.sales : []);
      })
      .catch((e) => {
        if (!cancelled) {
          console.error(e);
          setSalesError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setSalesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [windowSel]);

  // Training is fetched ONCE, deliberately outside the window dependency: it is
  // all-time, so a refetch per toggle click would re-run the heaviest query on
  // the page to produce an identical answer.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/training/leaderboard?scope=overall")
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((json: { rows?: TrainingPlace[] }) => {
        if (cancelled) return;
        const rows = Array.isArray(json.rows) ? json.rows : [];
        // isPodium is the board's OWN judgement of the company top three
        // (src/lib/training/board.ts), reused rather than re-derived here so
        // this strip can never disagree with the Course Leaderboard page.
        setTraining(rows.filter((r) => r.isPodium).slice(0, 3));
      })
      .catch((e) => {
        if (!cancelled) {
          console.error(e);
          setTrainingError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      <PodiumCard
        title="Top 3 in Sales"
        caption={WINDOW_CAPTION[windowSel]}
        linkLabel="Full Sales Leaderboard"
        onLink={() => router.push("/c-level/sales-leaderboard")}
        loading={salesLoading}
        error={salesError}
        // "Nobody has sold anything yet in this period" is a real, honest state
        // early in a week, not a failure. It gets its own wording rather than
        // an empty card.
        emptyMessage="No contracts recorded yet for this period."
        rows={(sales || []).map((p) => ({
          key: p.id,
          place: p.place,
          name: p.name,
          headshotUrl: p.headshotUrl,
          value: fmtMoney(p.revenue),
        }))}
      />

      <PodiumCard
        title="Top 3 in Training"
        caption="All time"
        // Says plainly why this half does not move with the toggle, so a
        // motionless podium reads as intended rather than broken.
        note="Lifetime standing, so this does not change with the period. Lesson completions were not dated before August 2026."
        linkLabel="Full Course Leaderboard"
        onLink={() => router.push("/c-level/course-leaderboard")}
        loading={training === null && !trainingError}
        error={trainingError}
        emptyMessage="No one has started a course yet."
        rows={(training || []).map((r, i) => ({
          key: r.id,
          place: r.rank ?? i + 1,
          name: r.name,
          headshotUrl: r.headshotUrl,
          value: `${fmtCount(r.itemsCompleted)} lessons`,
        }))}
      />
    </div>
  );
}

interface PodiumRow {
  key: string;
  place: number;
  name: string;
  headshotUrl?: string;
  value: string;
}

function PodiumCard(props: {
  title: string;
  caption: string;
  note?: string;
  linkLabel: string;
  onLink: () => void;
  loading: boolean;
  error: boolean;
  emptyMessage: string;
  rows: PodiumRow[];
}): JSX.Element {
  const { title, caption, note, linkLabel, onLink, loading, error, emptyMessage, rows } = props;

  let body: JSX.Element;
  if (loading) {
    body = <div style={{ fontSize: 13, color: "var(--text-subtle)" }}>Loading…</div>;
  } else if (error) {
    // Never fall through to an empty podium on a failed request: three blank
    // medals would claim "nobody is winning", which is a different and false
    // statement from "we could not load this".
    body = <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Couldn't load this right now.</div>;
  } else if (rows.length === 0) {
    body = <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{emptyMessage}</div>;
  } else {
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((row) => (
          <div key={row.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Medal sits BESIDE the photo, never on top of it: the existing
                Contract King badge overlays the avatar, which loads the rep's
                headshot and then hides it behind the medal. */}
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                flexShrink: 0,
                background: MEDAL_BG[row.place] || "var(--border-default)",
                color: "#3a2400",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                fontSize: 12,
                boxShadow: "inset 0 1px 2px rgb(var(--white-rgb) / 0.4)",
              }}
            >
              {row.place}
            </div>
            <RepAvatar name={row.name} url={row.headshotUrl} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={row.name}
              >
                {row.name}
              </div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)", flexShrink: 0 }}>
              {row.value}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={CARD}>
      <div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 2 }}>{caption}</div>
      </div>

      {body}

      {note && <div style={{ fontSize: 11.5, color: "var(--text-subtle)", lineHeight: 1.4 }}>{note}</div>}

      <button
        type="button"
        onClick={onLink}
        style={{
          alignSelf: "flex-start",
          border: "none",
          background: "none",
          padding: 0,
          color: "#e5484d",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          textDecoration: "underline",
        }}
      >
        {linkLabel}
      </button>
    </div>
  );
}
