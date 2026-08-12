import type { Dir } from "../../../lib/scoreboard/metrics";
import { fmtConversionRate } from "../../../lib/scoreboard/display";

// Same green/red/neutral tokens MetricTile uses for up/down/flat, kept local
// for the same reason MetricTile keeps its own copy: this is a different
// subsystem and two hex codes don't justify a cross-import.
const GREEN = "#10b981";
const RED = "#dc2626";
const NEUTRAL = "#6b7280";

interface ConversionCell {
  rate: number;
  hidden: boolean;
  dir: Dir;
}

/**
 * The two funnel rates (knock -> claim, claim -> contract) side by side.
 * Every number and every "do we actually know enough to say a rate" judgement
 * is delegated: `hidden` comes from src/lib/scoreboard/metrics.ts (the sample
 * floor) and is rendered by fmtConversionRate in display.ts, which already
 * knows to show "not enough data yet" instead of a fabricated "0%". This
 * component only lays the two cells out and picks an arrow glyph + color for
 * a non-null `dir` -- it never computes a rate or decides visibility itself.
 */
export function ConversionStrip(props: {
  knockToClaim: ConversionCell;
  claimToContract: ConversionCell;
}): JSX.Element {
  const { knockToClaim, claimToContract } = props;

  return (
    <div
      style={{
        background: "var(--surface-default)",
        border: "1px solid var(--border-default)",
        borderRadius: 12,
        padding: "14px 16px",
        display: "flex",
        gap: 24,
        flexWrap: "wrap",
      }}
    >
      <ConversionCellView label="knock to claim" cell={knockToClaim} />
      <ConversionCellView label="claim to contract" cell={claimToContract} />
    </div>
  );
}

function ConversionCellView(props: { label: string; cell: ConversionCell }): JSX.Element {
  const { label, cell } = props;
  const { rate, hidden, dir } = cell;

  const text = fmtConversionRate(rate, hidden);

  const color = dir === "up" ? GREEN : dir === "down" ? RED : dir === "flat" ? NEUTRAL : NEUTRAL;
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : dir === "flat" ? "●" : null;
  // Text word alongside the arrow so direction is never carried by color (or
  // glyph shape) alone -- a screen reader gets "up"/"down"/"flat" same as a
  // sighted reader.
  const word = dir === "up" ? "up" : dir === "down" ? "down" : dir === "flat" ? "flat" : null;

  return (
    <div style={{ minWidth: 120 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)" }}>{text}</div>
        {/* No arrow at all when dir is null: no prior period is not the same
            as a flat or green trend. */}
        {arrow !== null && word !== null && (
          <span style={{ fontSize: 12, fontWeight: 700, color }}>
            {arrow} {word}
          </span>
        )}
      </div>
    </div>
  );
}
