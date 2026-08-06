/**
 * Marketing's variant of the Scoreboard home screen (spec S11). Marketing
 * doesn't sell and has no org-chart subtree, so it never gets the sales
 * rollup ScoreboardHome renders for the other five roles -- pages/api/
 * scoreboard.ts intercepts marketing before scope resolution and returns
 * `{ variant: "marketing", scoreboard: null }` instead.
 *
 * This replaces the old src/portals/marketing/Dashboard.tsx, which showed
 * hardcoded, fabricated campaign/engagement/download figures made up out of
 * thin air. None of that survives here: every tile below is an honest "not
 * connected yet" placeholder, never a number that looks measured but isn't.
 * Tile set is the spec's provisional list (S11) -- Social Engagement,
 * Reach / Followers, Rep Pages Live -- pending a real marketing data source.
 *
 * `firstName` is computed by the caller (ScoreboardHome derives it from the
 * session) rather than re-read here, matching how MetricTile/RankStrip/
 * ConversionStrip receive pre-computed values instead of reading auth state
 * themselves.
 */
export function MarketingHome(props: { firstName: string }): JSX.Element {
  const { firstName } = props;

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, maxWidth: 960 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>Hi, {firstName}</div>

      <div style={{ fontSize: 14, color: "#6b7280" }}>
        Marketing metrics aren't connected to a data source yet.
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        <EmptyTile label="Social Engagement" />
        <EmptyTile label="Reach / Followers" />
        <EmptyTile label="Rep Pages Live" />
      </div>
    </div>
  );
}

// Same card shell and label treatment as MetricTile (label caption, then a
// big value line), except the "value" is deliberately not a value: an en
// dash stands in for "nothing measured", never a 0 or a blank that could be
// mistaken for a real reading, and the caption underneath says so in words
// too.
function EmptyTile(props: { label: string }): JSX.Element {
  const { label } = props;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: "14px 16px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "#6b7280",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </div>

      <div style={{ fontSize: 24, fontWeight: 800, color: "#111827", marginTop: 4 }}>&ndash;</div>

      <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>Not connected yet</div>
    </div>
  );
}
