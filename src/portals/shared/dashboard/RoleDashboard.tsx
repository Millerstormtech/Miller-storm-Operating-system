import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtMoney, fmtCount, trendLabel } from "../../../lib/scoreboard/display";
import type { Dir } from "../../../lib/scoreboard/metrics";
import type { ScopeLevel } from "../../../lib/scoreboard/types";
import { stripFormerMarker } from "../../../lib/leaderboard/formerRep";
import {
  METRICS,
  type Metric,
  type Leader,
  type RepLine,
  type MonthLine,
  type BreakdownKind,
} from "../../../lib/scoreboard/dashboard";
import {
  salesLink,
  trainingLink,
  scopeFilter,
  monthRange,
  METRIC_SORT,
  type RowFilter,
  type ScopeRef,
} from "../../../lib/scoreboard/links";

// One board at four zoom levels. Which level a viewer gets is decided on the
// server by resolveScope(), never here: this component only draws whatever the
// API says is in scope, so a UI bug can never widen someone's access.
//
// Every ranking rule (who is top three, who is excluded, how ties break) lives
// in src/lib/scoreboard/dashboard.ts and runs on the server. Nothing here sorts
// or filters, so the screen cannot drift from the endpoint.
//
// Every "See all" destination comes from src/lib/scoreboard/links.ts. The links
// only pre-set the leaderboard's own filters; they grant no access of their own.

type Totals = { revenue: number; knocks: number; claims: number; contracts: number };

interface CardPayload {
  value: number;
  previous: number;
  trend: { pct: number | null; dir: Dir };
  top: Leader[];
}

interface GroupPayload {
  key: string;
  totals: Totals;
  yearTotals: Totals;
  leaders: Record<Metric, Leader | null>;
}

interface LowestKnocksPayload {
  from: string;
  to: string;
  reps: Array<{ id: string; repUserId: string | null; name: string; knocks: number; lastKnockDay: string | null }>;
}

interface DashboardPayload {
  variant?: string;
  dashboard?: null;
  scope: { level: string; label: string; resolved: boolean; count: number; viewer: string; team?: string; branch?: string };
  hero: { revenue: number; contracts: number; year: number; averageContract: number | null };
  cards: Record<Metric, CardPayload>;
  rank: { rank: number; of: number } | null;
  breakdown: {
    kind: BreakdownKind;
    groups?: GroupPayload[];
    reps?: RepLine[];
    months?: MonthLine[];
    best?: Record<Metric, { label: string; value: number; pct: number } | null>;
  };
  training: {
    pct: number;
    headcount: number;
    top: Array<{ id: string; name: string; pct: number }>;
    credentials: Array<{ key: string; pct: number; earned: boolean }> | null;
  };
  news: Array<{ text: string; at: string }> | null;
  lowestKnocks: LowestKnocksPayload | null;
}

const METRIC_TITLE: Record<Metric, string> = {
  revenue: "Revenue",
  contracts: "Contracts",
  claims: "Claims",
  knocks: "Verified Knocks",
};

// Jay's order, left to right: the money, then what produced it, then the two
// activity metrics that feed both.
const CARD_ORDER: Metric[] = ["revenue", "contracts", "claims", "knocks"];

const CREDENTIAL_LABEL: Record<string, string> = {
  certificate: "Miller Storm Certification",
  knockers: "Millionaire Knockers",
  hustlers: "Roof Hustlers",
};

const CARD: React.CSSProperties = {
  background: "var(--surface-default)",
  border: "1px solid var(--border-default)",
  borderRadius: 12,
  padding: "15px 16px",
  minWidth: 0,
};

const CAP: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  fontWeight: 600,
  display: "block",
};

const SUB: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-subtle)",
  display: "block",
  marginTop: 1,
};

const NUM: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  lineHeight: 1.05,
  color: "var(--text-primary)",
  fontVariantNumeric: "tabular-nums",
  marginTop: 4,
};

const LINK: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--brand-on-surface)",
  textDecoration: "none",
  whiteSpace: "nowrap",
  flex: "none",
};

// A name that opens the leaderboard. Underlined so it reads as a link without
// shouting over the numbers beside it.
const NAME_LINK: React.CSSProperties = {
  color: "inherit",
  textDecoration: "underline",
  textDecorationColor: "var(--border-default)",
  textUnderlineOffset: 3,
};

function fmt(metric: Metric, n: number): string {
  return metric === "revenue" ? fmtMoney(n) : fmtCount(n);
}

/** "2026-09-05" -> "Sep 5". Read at noon UTC so no timezone can shift the day. */
function fmtDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function SeeAll(props: { href: string }): JSX.Element {
  return (
    <Link href={props.href} style={LINK}>
      See all &rsaquo;
    </Link>
  );
}

function CardHead(props: { title: string; sub: string; href?: string }): JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <span style={CAP}>{props.title}</span>
        <span style={SUB}>{props.sub}</span>
      </div>
      {props.href ? <SeeAll href={props.href} /> : null}
    </div>
  );
}

function Bar(props: { pct: number }): JSX.Element {
  return (
    <div style={{ height: 3, borderRadius: 2, background: "var(--surface-muted)", marginTop: 4, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, props.pct))}%`, background: "var(--brand-fill)", borderRadius: 2 }} />
    </div>
  );
}

function LeaderList(props: { metric: Metric; items: Leader[] }): JSX.Element | null {
  if (props.items.length === 0) return null;
  const top = props.items[0].value || 1;
  return (
    <div style={{ marginTop: 12, paddingTop: 11, borderTop: "1px solid var(--border-default)", display: "flex", flexDirection: "column", gap: 7 }}>
      {props.items.map((l, i) => (
        <div key={`${l.repUserId ?? l.name}-${i}`}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: i === 0 ? "var(--brand-on-surface)" : "var(--text-subtle)", width: 10, flex: "none" }}>{i + 1}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", flex: 1, minWidth: 0, whiteSpace: "normal", overflowWrap: "anywhere" }}>{l.name}</span>
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums", flex: "none" }}>{fmt(props.metric, l.value)}</span>
          </div>
          <Bar pct={Math.round((l.value / top) * 100)} />
        </div>
      ))}
    </div>
  );
}

function MetricCard(props: {
  metric: Metric;
  card: CardPayload;
  href: string;
  best?: { label: string; value: number; pct: number } | null;
  showBest: boolean;
}): JSX.Element {
  const { metric, card } = props;
  const label = trendLabel(card.trend.pct, card.trend.dir, "month");
  const dirColor = card.trend.dir === "up" ? "var(--trend-up)" : card.trend.dir === "down" ? "var(--trend-down)" : "var(--text-subtle)";
  return (
    <div style={CARD}>
      <CardHead title={METRIC_TITLE[metric]} sub="Month to date" href={props.href} />
      <div style={NUM}>{fmt(metric, card.value)}</div>
      <div style={{ fontSize: 12, marginTop: 5, color: label ? dirColor : "var(--text-subtle)" }}>
        {label ? `${label}` : "No comparison yet"}
      </div>

      {/* A rep has nobody below them, so the podium slot carries their own best
          finished month instead. Same competitive pressure, aimed inward. */}
      {props.showBest ? (
        props.best ? (
          <div style={{ marginTop: 12, paddingTop: 11, borderTop: "1px solid var(--border-default)" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>Best month, {props.best.label}</span>
              <span style={{ fontSize: 12, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{fmt(metric, props.best.value)}</span>
            </div>
            <Bar pct={props.best.pct} />
          </div>
        ) : (
          <div style={{ marginTop: 12, paddingTop: 11, borderTop: "1px solid var(--border-default)", fontSize: 12, color: "var(--text-subtle)" }}>
            No finished month to compare yet
          </div>
        )
      ) : (
        <LeaderList metric={metric} items={card.top} />
      )}
    </div>
  );
}

// Branch cards (C-Level) and team cards (Branch Manager). The only cards with a
// link under each #1 as well as a "See all": a card holding three different
// leaders cannot open one board that is sorted right for all three.
function GroupCards(props: { kind: "branch" | "team"; groups: GroupPayload[]; level: ScopeLevel }): JSX.Element {
  return (
    // Capped at three across so a fourth branch or team wraps underneath
    // instead of squeezing every card thinner.
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 11, marginBottom: 11 }}>
      {props.groups.map((g) => {
        const filter: RowFilter = props.kind === "branch" ? { branch: g.key } : { team: g.key };
        const month = { window: "month" as const };
        return (
          <div key={g.key} style={CARD}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 9, marginBottom: 12, paddingBottom: 9, borderBottom: "1px solid var(--border-default)" }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
                {props.kind === "team" ? `Team ${g.key}` : g.key}
              </span>
              <SeeAll href={salesLink(props.level, { period: month, sort: "revenue", filter })} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11, marginBottom: 12 }}>
              {([["Revenue", "revenue"], ["Contracts", "contracts"]] as Array<[string, Metric]>).map(([title, m]) => (
                <div key={m}>
                  <span style={{ ...CAP, fontSize: 10, fontWeight: 400 }}>{title}</span>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 12, color: "var(--text-subtle)", whiteSpace: "nowrap" }}>Year</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmt(m, g.yearTotals[m])}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 3 }}>
                    <span style={{ fontSize: 12, color: "var(--text-subtle)", whiteSpace: "nowrap" }}>Month</span>
                    <span style={{ fontSize: 13, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmt(m, g.totals[m])}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: 11 }}>
              <span style={{ ...CAP, fontSize: 10, fontWeight: 400 }}>Top rep &middot; month to date</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 11, marginTop: 8 }}>
                {(["revenue", "claims", "knocks"] as Metric[]).map((m) => (
                  <div key={m} style={{ minWidth: 0 }}>
                    <span style={{ ...CAP, fontSize: 10, fontWeight: 400 }}>#1 {METRIC_TITLE[m]}</span>
                    <b style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "normal", overflowWrap: "anywhere", marginTop: 3 }}>
                      {g.leaders[m]?.name ?? "Nobody yet"}
                    </b>
                    <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                      {g.leaders[m] ? fmt(m, g.leaders[m]!.value) : "–"}
                    </span>
                    <div style={{ marginTop: 4 }}>
                      <SeeAll href={salesLink(props.level, { period: month, sort: METRIC_SORT[m], filter })} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LowestKnocksCard(props: { level: ScopeLevel; filter: RowFilter; card: LowestKnocksPayload; style: React.CSSProperties }): JSX.Element {
  const { card } = props;
  const period = { from: card.from, to: card.to };
  return (
    <div style={{ ...CARD, ...props.style }}>
      <CardHead
        title="Lowest Knocks"
        sub={`Last 7 days, ${fmtDay(card.from)} to ${fmtDay(card.to)}`}
        // Lowest first, so the board continues the card's list instead of
        // flipping it upside down.
        href={salesLink(props.level, { period, sort: "verifiedKnocks", dir: "asc", filter: props.filter })}
      />
      <div style={{ marginTop: 12, paddingTop: 11, borderTop: "1px solid var(--border-default)", display: "flex", flexDirection: "column", gap: 9 }}>
        {card.reps.map((r, i) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--text-subtle)", width: 10, flex: "none" }}>{i + 1}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
              <Link
                href={salesLink(props.level, { period, sort: "verifiedKnocks", dir: "asc", filter: props.filter, focus: r.id })}
                style={NAME_LINK}
              >
                {stripFormerMarker(r.name)}
              </Link>
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums", flex: "none" }}>
              {fmtCount(r.knocks)} {r.knocks === 1 ? "knock" : "knocks"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const TH: React.CSSProperties = {
  padding: "9px 10px",
  textAlign: "right",
  fontSize: 10,
  letterSpacing: "0.09em",
  textTransform: "uppercase",
  color: "var(--text-subtle)",
  fontWeight: 400,
  borderBottom: "1px solid var(--border-default)",
  whiteSpace: "nowrap",
};
const TD: React.CSSProperties = {
  padding: "9px 10px",
  textAlign: "right",
  fontSize: 13,
  color: "var(--text-muted)",
  fontVariantNumeric: "tabular-nums",
  borderBottom: "1px solid var(--border-default)",
  whiteSpace: "nowrap",
};
const TD_NAME: React.CSSProperties = { ...TD, textAlign: "left", fontSize: 14, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "normal" };

function Pill(props: { text: string; strong?: boolean }): JSX.Element {
  return (
    <span style={{ display: "inline-block", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", padding: "1px 6px", borderRadius: 9, marginLeft: 7, background: props.strong ? "var(--brand-fill)" : "var(--surface-muted)", color: props.strong ? "var(--text-inverse)" : "var(--text-subtle)" }}>
      {props.text}
    </span>
  );
}

function DataTable(props: {
  title: string;
  sub: string;
  head: string;
  href: string;
  rows: Array<{ label: string; href?: string; pill?: { text: string; strong?: boolean }; values: Array<[Metric, number]> }>;
}): JSX.Element {
  return (
    <div style={{ ...CARD, marginBottom: 11 }}>
      <CardHead title={props.title} sub={props.sub} href={props.href} />
      <div style={{ width: "100%", overflowX: "auto", marginTop: 12 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
          <thead>
            <tr>
              <th style={{ ...TH, textAlign: "left" }}>{props.head}</th>
              {CARD_ORDER.map((m) => (
                <th key={m} style={TH}>{METRIC_TITLE[m]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r, i) => (
              <tr key={`${r.label}-${i}`}>
                <td style={TD_NAME}>
                  {r.href ? (
                    <Link href={r.href} style={NAME_LINK}>
                      {r.label}
                    </Link>
                  ) : (
                    r.label
                  )}
                  {r.pill ? <Pill text={r.pill.text} strong={r.pill.strong} /> : null}
                </td>
                {r.values.map(([m, v]) => (
                  <td key={m} style={m === "revenue" ? { ...TD, color: "var(--text-primary)", fontWeight: 500 } : TD}>
                    {v === 0 ? <span style={{ color: "var(--text-subtle)" }}>&ndash;</span> : fmt(m, v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function RoleDashboard(): JSX.Element {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard")
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((json: DashboardPayload) => {
        if (!cancelled) setData(json);
      })
      .catch((e) => {
        if (!cancelled) {
          console.error(e);
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 320 }}>
        <div style={{ textAlign: "center" }}>
          <div className="spinner" style={{ margin: "0 auto 16px" }} />
          <div style={{ color: "var(--text-muted)" }}>Loading your dashboard...</div>
        </div>
      </div>
    );
  }

  // Never draw an empty board on failure: a screen full of zeroes reads as
  // "nobody sold anything", which is a different and much worse claim than
  // "we could not load this".
  if (failed || !data || !data.scope) {
    return (
      <div style={{ ...CARD, textAlign: "center", padding: "40px 20px" }}>
        <div style={{ color: "var(--text-primary)", fontWeight: 600, marginBottom: 6 }}>The dashboard could not load</div>
        <div style={{ color: "var(--text-muted)", fontSize: 14 }}>Refresh the page. If it keeps happening, tell an admin so the sync can be checked.</div>
      </div>
    );
  }

  const isSelf = data.scope.level === "self";
  const bd = data.breakdown;
  const level = data.scope.level as ScopeLevel;
  const scopeRef: ScopeRef = { level, branch: data.scope.branch, team: data.scope.team };
  const filter = scopeFilter(scopeRef);
  const month = { window: "month" as const };

  // C-Level reads it before the branch cards; a branch manager or team lead
  // gets it at the very bottom (Youssef, 2026-09-13). The API never sends it to
  // a rep, and a card with nobody on it is not drawn.
  const lowest =
    data.lowestKnocks && data.lowestKnocks.reps.length > 0 ? data.lowestKnocks : null;

  return (
    <div>
      {/* Headline: the year, always, whatever the cards below are showing. */}
      <div style={{ ...CARD, marginBottom: 11 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 26, flexWrap: "wrap" }}>
          <div>
            <span style={CAP}>{isSelf ? "My Revenue" : "Total Revenue"}</span>
            <span style={SUB}>
              {data.scope.label ? `${data.scope.label}, ` : ""}year to date {data.hero.year}
            </span>
            <div style={{ ...NUM, fontSize: 46 }}>{fmtMoney(data.hero.revenue)}</div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <span style={CAP}>{isSelf ? "My Contracts" : "Total Contracts"}</span>
            <span style={SUB}>Year to date {data.hero.year}</span>
            <div style={{ ...NUM, fontSize: 22 }}>{fmtCount(data.hero.contracts)}</div>
          </div>
        </div>
        <div style={{ marginTop: 12, paddingTop: 11, borderTop: "1px solid var(--border-default)", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {data.hero.averageContract != null ? (
              <>
                {isSelf ? "My average contract " : "Average contract "}
                <b style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(data.hero.averageContract)}</b>
                {" "}year to date
              </>
            ) : null}
          </span>
          <SeeAll href={salesLink(level, { period: { window: "year" }, sort: "revenue", filter })} />
        </div>
        {data.rank ? (
          <div style={{ marginTop: 11, paddingTop: 11, borderTop: "1px solid var(--border-default)", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {isSelf ? "You are " : `${data.scope.label} is `}
              <b style={{ color: "var(--text-primary)" }}>#{data.rank.rank}</b> of {data.rank.of} by revenue this month
            </span>
            {/* The rank compares against everyone, so its link drops the scope
                filter and opens the whole board. */}
            <SeeAll href={salesLink(level, { period: month, sort: "revenue" })} />
          </div>
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 11, marginBottom: 11 }}>
        {CARD_ORDER.map((m) => (
          <MetricCard
            key={m}
            metric={m}
            card={data.cards[m]}
            href={salesLink(level, { period: month, sort: METRIC_SORT[m], filter })}
            showBest={isSelf}
            best={bd.best ? bd.best[m] : null}
          />
        ))}
      </div>

      {lowest && level === "company" ? (
        <LowestKnocksCard level={level} filter={filter} card={lowest} style={{ marginBottom: 11 }} />
      ) : null}

      {(bd.kind === "branch" || bd.kind === "team") && bd.groups ? (
        bd.groups.length > 0 ? (
          <GroupCards kind={bd.kind} groups={bd.groups} level={level} />
        ) : (
          <div style={{ ...CARD, marginBottom: 11, color: "var(--text-muted)", fontSize: 14 }}>
            No {bd.kind === "branch" ? "branches" : "teams"} have numbers this month yet.
          </div>
        )
      ) : null}

      {bd.kind === "rep" && bd.reps ? (
        bd.reps.length > 0 ? (
          <DataTable
            title="My Reps"
            sub={`${bd.reps.length} ${bd.reps.length === 1 ? "person" : "people"}, month to date, highest revenue first`}
            head="Rep"
            href={salesLink(level, { period: month, sort: "revenue", filter })}
            rows={bd.reps.map((r) => ({
              label: r.name,
              pill: r.former ? { text: "Former" } : undefined,
              values: CARD_ORDER.map((m) => [m, (r as unknown as Record<Metric, number>)[m]] as [Metric, number]),
            }))}
          />
        ) : (
          <div style={{ ...CARD, marginBottom: 11, color: "var(--text-muted)", fontSize: 14 }}>
            Nobody on this team has numbers this month yet.
          </div>
        )
      ) : null}

      {bd.kind === "month" && bd.months ? (
        <DataTable
          title="My Months"
          sub="This year, newest first"
          head="Month"
          href={salesLink(level, { period: month, sort: "revenue" })}
          rows={bd.months.map((mo, i) => ({
            label: mo.label,
            // Each month opens that calendar month on the board, so a rep can see
            // where they ranked. The newest row is the month in progress.
            href: salesLink(level, { period: i === 0 ? month : monthRange(mo.key), sort: "revenue" }),
            pill: i === 0 ? { text: "This month", strong: true } : undefined,
            values: CARD_ORDER.map((m) => [m, (mo as unknown as Record<Metric, number>)[m]] as [Metric, number]),
          }))}
        />
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: data.news ? "1fr 1.55fr" : "1fr", gap: 11 }}>
        <div style={CARD}>
          <CardHead
            title="Training Center"
            sub={isSelf ? "My progress, all time" : `${data.scope.label || "Company"}, all time`}
            href={trainingLink(scopeRef)}
          />
          <div style={{ ...NUM, fontSize: 28 }}>{data.training.pct}%</div>
          <div style={{ fontSize: 12, marginTop: 5, color: "var(--text-subtle)" }}>
            {isSelf
              ? "of the whole library finished"
              : `average course completion across ${data.training.headcount} ${data.training.headcount === 1 ? "rep" : "reps"}`}
          </div>

          {isSelf && data.training.credentials ? (
            <div style={{ marginTop: 13, paddingTop: 12, borderTop: "1px solid var(--border-default)", display: "grid", gap: 12 }}>
              {data.training.credentials.map((c) => (
                <div key={c.key}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{CREDENTIAL_LABEL[c.key] || c.key}</span>
                    <span style={{ fontSize: 12, color: c.earned ? "var(--trend-up)" : "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                      {c.earned ? "Earned" : `${c.pct}%`}
                    </span>
                  </div>
                  <Bar pct={c.pct} />
                </div>
              ))}
            </div>
          ) : (
            <LeaderList
              metric="claims"
              items={data.training.top.map((t) => ({ repUserId: t.id, name: t.name, value: t.pct }))}
            />
          )}
        </div>

        {/* News is C-level only: company highlights are Jay's, and a branch-only
            feed would be empty most weeks. No link: there is no page of news. */}
        {data.news ? (
          <div style={CARD}>
            <span style={CAP}>News</span>
            <span style={SUB}>Last 7 days</span>
            {data.news.length === 0 ? (
              <div style={{ marginTop: 12, fontSize: 14, color: "var(--text-muted)" }}>Nothing new this week.</div>
            ) : (
              <div style={{ marginTop: 8 }}>
                {data.news.map((n, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: i === data.news!.length - 1 ? "none" : "1px solid var(--border-default)" }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--brand-fill)", marginTop: 8, flex: "none" }} />
                    <span style={{ fontSize: 14, lineHeight: 1.45, color: "var(--text-primary)" }}>{n.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {lowest && level !== "company" ? (
        <LowestKnocksCard level={level} filter={filter} card={lowest} style={{ marginTop: 11 }} />
      ) : null}
    </div>
  );
}
