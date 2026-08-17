import { useState } from "react";
import type { CSSProperties } from "react";
import type { CredentialProgress } from "../../../lib/training/credentials";
import { CREDENTIALS } from "../../../lib/training/credentials";
import {
  PODIUM,
  GREEN,
  RING_TRACK,
  DELTA_DOWN,
  avatarColor,
  initials,
} from "./constants";
import { Tooltip } from "./Tooltip";

export type RepCardData = {
  id: string;
  name: string;
  headshotUrl: string;
  branch: string;
  team: string;
  pct: number;
  /** Progress through each of the three credentials, in row order. */
  credentials?: CredentialProgress[];
  isPodium: boolean;
  videosWatched?: number;
  quizzesPassed?: number;
  /** Company-rank movement since last week. Nothing renders for null/undefined/0. */
  rankDelta?: number | null;
};

export function ProgressRing({ pct, size = 52, holeBg = "var(--surface-default)" }: { pct: number; size?: number; holeBg?: string }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const deg = Math.round((clamped / 100) * 360);
  return (
    <Tooltip text={`Progress: videos watched + quizzes passed (${Math.round(clamped)}%)`}>
      <div
        style={{
          position: "relative",
          width: size,
          height: size,
          borderRadius: "50%",
          background: `conic-gradient(${GREEN} 0deg ${deg}deg, ${RING_TRACK} ${deg}deg 360deg)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: Math.round(size * 0.75),
            height: Math.round(size * 0.75),
            borderRadius: "50%",
            background: holeBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: Math.round(size * 0.23),
            color: "var(--text-primary)",
          }}
        >
          {Math.round(clamped)}%
        </div>
      </div>
    </Tooltip>
  );
}

export function Avatar({ name, headshotUrl, size }: { name: string; headshotUrl: string; size: number }) {
  const [errored, setErrored] = useState(false);
  if (headshotUrl && !errored) {
    return (
      <img
        src={headshotUrl}
        alt={name}
        onError={() => setErrored(true)}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: avatarColor(name),
        color: "var(--text-inverse)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: Math.round(size * 0.34),
        flexShrink: 0,
      }}
    >
      {initials(name)}
    </div>
  );
}

/**
 * The one card every rep is drawn as, on every view. Top 3 emphasis, filtered
 * dual-ranks, the YOU tag and the your-rank strip are all the SAME card with
 * different props, so there is exactly one card style to maintain.
 */
export function RepCard({
  row,
  primaryRank,
  coRank,
  medal = false,
  isNarrow,
  youTag = false,
  milestone = null,
  containerStyle,
  onClick,
}: {
  row: RepCardData;
  primaryRank: number | null;
  coRank?: number | null;
  medal?: boolean;
  isNarrow: boolean;
  youTag?: boolean;
  milestone?: string | null;
  containerStyle?: CSSProperties;
  onClick?: () => void;
}) {
  const isLeader = medal && primaryRank === 1;
  const avatarSize = isNarrow ? 40 : 46;
  const pct = Math.min(100, Math.max(0, row.pct));
  const cond = '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif';

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      title={`${typeof coRank === "number" ? `co.#${coRank}` : ""}${milestone ? `${typeof coRank === "number" ? " · " : ""}next: ${milestone}` : ""}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: isNarrow ? 10 : 14,
        background: isLeader
          ? "linear-gradient(90deg, rgba(202,0,2,0.16), var(--surface-default) 72%)"
          : "var(--surface-default)",
        border: `1px solid ${isLeader ? "rgba(202,0,2,0.4)" : "var(--border-default)"}`,
        borderRadius: 14,
        padding: isNarrow ? "10px 12px" : "12px 16px",
        marginBottom: 10,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        cursor: onClick ? "pointer" : "default",
        ...containerStyle,
      }}
    >
      <Avatar name={row.name} headshotUrl={row.headshotUrl} size={avatarSize} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: cond,
            fontWeight: 800,
            fontSize: isNarrow ? 15 : 17,
            letterSpacing: 0.3,
            textTransform: "uppercase",
            color: "var(--text-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {row.name}
          {row.isPodium && (
            <Tooltip text={`${PODIUM.label}: ${PODIUM.meaning}`}>
              <span style={{ fontSize: isNarrow ? 12 : 13 }}>{PODIUM.emoji}</span>
            </Tooltip>
          )}
          {typeof row.rankDelta === "number" && row.rankDelta !== 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: row.rankDelta > 0 ? GREEN : DELTA_DOWN }}>
              {row.rankDelta > 0 ? `▲${row.rankDelta}` : `▼${-row.rankDelta}`}
            </span>
          )}
          {youTag && (
            <span
              style={{
                background: "#ca0002",
                color: "var(--text-inverse)",
                fontSize: 9,
                fontWeight: 700,
                padding: "1px 6px",
                borderRadius: 999,
              }}
            >
              YOU
            </span>
          )}
        </div>
        {(row.branch || row.team) && (
          <div style={{ marginTop: 2, fontSize: 12.5, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {[row.branch, row.team && `Team ${row.team}`].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>

      {/* Horizontal progress + percentage */}
      {!isNarrow && (
        <div style={{ width: 220, flexShrink: 0, height: 8, borderRadius: 5, background: "var(--surface-muted)", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", borderRadius: 5, background: "linear-gradient(90deg, #b30002, #e01418)" }} />
        </div>
      )}
      <span style={{ fontFamily: cond, fontSize: isNarrow ? 17 : 20, fontWeight: 800, color: "var(--text-primary)", minWidth: isNarrow ? 44 : 56, textAlign: "right", flexShrink: 0 }}>
        {Math.round(pct)}%
      </span>

      {/* Triple Track: one labelled track per credential, each with its own mark,
          bar and percentage. Approved 2026-08-15; the point is that a rep can be
          read without anyone clicking into them, which is why the exact figure is
          on the row rather than only in a tooltip.

          These deliberately do NOT sum to the overall percentage on the left:
          each counts only the courses inside its own credential. A rep can be
          86% overall while holding two credentials outright. */}
      {!isNarrow && row.credentials && row.credentials.length > 0 && (
        <div style={{ display: "flex", gap: 14, flexShrink: 0 }}>
          {row.credentials.map((c) => {
            const meta = CREDENTIALS.find((m) => m.key === c.key);
            const label = meta?.label || c.key;
            return (
              <Tooltip
                key={c.key}
                text={
                  c.earned
                    ? `${label}: earned (${c.coursesTotal} course${c.coursesTotal === 1 ? "" : "s"})`
                    : `${label}: ${c.pct}% (${c.coursesCompleted} of ${c.coursesTotal} courses)`
                }
              >
                <div style={{ width: 104 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                    {/* Filled mark = earned, outlined = in progress. Shape and
                        weight carry it, so the row still reads in greyscale. */}
                    <span
                      aria-hidden="true"
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 3,
                        flexShrink: 0,
                        background: c.earned ? "#ca0002" : "transparent",
                        border: `1.5px solid ${c.earned ? "#ca0002" : "var(--border-default)"}`,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                        color: "var(--text-muted)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {meta?.short || c.key}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ flex: 1, height: 6, borderRadius: 4, background: "var(--surface-muted)", overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(0, c.pct))}%`,
                          height: "100%",
                          borderRadius: 4,
                          background: "linear-gradient(90deg, #b30002, #e01418)",
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", minWidth: 30, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {c.pct}%
                    </span>
                  </div>
                </div>
              </Tooltip>
            );
          })}
        </div>
      )}
    </div>
  );
}
