// src/portals/shared/canvass-map/HouseCard.tsx
// One house, as a rep reads it on the map (spec A3): address, colour and why,
// hail history, the last knocks with the rep's name, its Miller Storm jobs, and
// a Directions link. Everything shown comes from /api/canvass/homes/[id]; what
// that may carry is decided in src/lib/canvass/card.ts. No em dashes on screen.

import type { HouseCard as HouseCardData } from "../../../lib/canvass/card";
import { DOT_RGB, LEGEND } from "../../../lib/canvass/mapView";
import { formatDay } from "../../../lib/canvass/dates";
import { formatInches } from "../../../lib/canvass/hail";

const rgb = (c: readonly number[]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

export function HouseCard({ card, onClose }: { card: HouseCardData; onClose: () => void }) {
  const legend = LEGEND.find((row) => row.color === card.color);
  const address = [card.address.line, [card.address.city, card.address.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const directions = card.address.line ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}` : null;

  return (
    <div style={{ padding: 14, display: "grid", gap: 12, fontSize: 13, color: "var(--text-primary)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>{address || "Address not on file"}</div>
        <button type="button" onClick={onClose} aria-label="Close" style={{ border: 0, background: "transparent", color: "var(--text-muted)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>
          x
        </button>
      </div>

      {card.color && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 14, height: 14, borderRadius: "50%", background: rgb(DOT_RGB[card.color]), display: "inline-block" }} />
          <span style={{ fontWeight: 600, textTransform: "uppercase" }}>{legend?.label ?? card.color}</span>
          {card.score !== null && <span style={{ color: "var(--text-muted)" }}>(score {card.score})</span>}
        </div>
      )}

      {card.reasons.length > 0 && (
        <section>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Why this colour</div>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 2 }}>
            {card.reasons.map((reason, i) => (
              <li key={i}>
                {reason.points > 0 ? `+${reason.points} ` : reason.points < 0 ? `${reason.points} ` : ""}
                {reason.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section style={{ display: "grid", gap: 2, color: "var(--text-secondary)" }}>
        <div>Built: {card.yearBuilt ?? "unknown"}</div>
        <div>Owner lives here: {card.ownerLivesHere === null ? "unknown" : card.ownerLivesHere ? "appears so" : "appears not"}</div>
        {card.roofMaterial && <div>Roof: {card.roofMaterial.toLowerCase()}</div>}
        {card.ownerName && <div>Owner: {card.ownerName}</div>}
      </section>

      {card.hail.length > 0 && (
        <section>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Hail (radar estimate)</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {card.hail.slice(0, 6).map((storm) => (
              <li key={storm.date}>
                {formatInches(storm.inches)} on {formatDay(storm.date)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {card.jobs.length > 0 && (
        <section>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Miller Storm jobs</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {card.jobs.map((job, i) => (
              <li key={i}>
                {job.stage || "Unknown stage"}
                {job.day ? ` since ${formatDay(job.day)}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Our knocks</div>
        {card.knocks.length === 0 ? (
          <div style={{ color: "var(--text-muted)" }}>Not knocked by Miller Storm yet</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {card.knocks.map((knock, i) => (
              <li key={i}>
                {formatDay(knock.day)}
                {knock.rep ? ` by ${knock.rep}` : ""}: {knock.status}
              </li>
            ))}
          </ul>
        )}
      </section>

      {directions && (
        <a href={directions} target="_blank" rel="noreferrer" style={{ alignSelf: "start", padding: "8px 12px", borderRadius: 8, background: "var(--ms-red)", color: "var(--text-inverse)", textDecoration: "none", fontWeight: 600 }}>
          Directions
        </a>
      )}
    </div>
  );
}
