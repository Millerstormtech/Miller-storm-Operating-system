import type { CSSProperties } from "react";
import type { BadgeId, RankTitle } from "../../../lib/training/scoring";
import {
  BADGE_META,
  PODIUM,
  TIER_COLORS,
  MEDALS,
  MEDAL_EDGE,
  GREEN,
  RING_TRACK,
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
  rankTitle: RankTitle;
  badges: BadgeId[];
  isPodium: boolean;
  videosWatched?: number;
  quizzesPassed?: number;
};

export function ProgressRing({ pct, size = 52, holeBg = "#fff" }: { pct: number; size?: number; holeBg?: string }) {
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
            color: "#111827",
          }}
        >
          {Math.round(clamped)}%
        </div>
      </div>
    </Tooltip>
  );
}

function Avatar({ name, headshotUrl, size }: { name: string; headshotUrl: string; size: number }) {
  if (headshotUrl) {
    return (
      <img
        src={headshotUrl}
        alt={name}
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
        color: "#fff",
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
  const tier = TIER_COLORS[row.rankTitle];
  const showMedal = medal && primaryRank !== null && primaryRank >= 1 && primaryRank <= 3;
  const avatarSize = isNarrow ? 40 : 44;
  const ringSize = isNarrow ? 46 : 52;

  const badgeIcons =
    row.badges.length > 0 ? (
      <span style={{ fontSize: isNarrow ? 13 : 14, letterSpacing: 2 }}>
        {row.badges.map((b) => (
          <Tooltip key={b} text={`${BADGE_META[b].label}: ${BADGE_META[b].meaning}`}>
            <span>{BADGE_META[b].emoji}</span>
          </Tooltip>
        ))}
      </span>
    ) : (
      <span style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>
        No badges yet
        {typeof row.videosWatched === "number" &&
        row.videosWatched > 0 &&
        row.quizzesPassed === 0
          ? ` (${row.videosWatched} videos, 0 quizzes passed)`
          : ""}
      </span>
    );

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: isNarrow ? 9 : 12,
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderLeft: showMedal ? `4px solid ${MEDAL_EDGE[primaryRank! - 1]}` : "1px solid #e5e7eb",
        borderRadius: 12,
        padding: isNarrow ? "10px 11px" : "11px 14px",
        marginBottom: 8,
        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
        cursor: onClick ? "pointer" : "default",
        ...containerStyle,
      }}
    >
      {/* Rank cell: medal, or number, or nothing for unranked */}
      <div style={{ width: isNarrow ? 22 : 30, textAlign: "center", flexShrink: 0 }}>
        {showMedal ? (
          <span style={{ fontSize: isNarrow ? 15 : 18 }}>{MEDALS[primaryRank! - 1]}</span>
        ) : primaryRank !== null ? (
          <span style={{ fontWeight: 800, fontSize: isNarrow ? 15 : 17, color: "#9ca3af" }}>{primaryRank}</span>
        ) : (
          <span style={{ color: "#d1d5db" }}>·</span>
        )}
      </div>

      <Avatar name={row.name} headshotUrl={row.headshotUrl} size={avatarSize} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: isNarrow ? 13 : 14,
            color: "#111827",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {row.name}
          {row.isPodium && (
            <Tooltip text={`${PODIUM.label}: ${PODIUM.meaning}`}>
              <span style={{ fontSize: isNarrow ? 12 : 13, marginLeft: 5 }}>{PODIUM.emoji}</span>
            </Tooltip>
          )}
          {youTag && (
            <span
              style={{
                background: "#4f46e5",
                color: "#fff",
                fontSize: 9,
                fontWeight: 700,
                padding: "1px 6px",
                borderRadius: 999,
                marginLeft: 6,
                verticalAlign: "middle",
              }}
            >
              YOU
            </span>
          )}
        </div>
        <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Tooltip text={`Rank: ${row.rankTitle} (by courses finished)`}>
            <span
              style={{
                background: tier.bg,
                color: tier.fg,
                padding: "1px 8px",
                borderRadius: 999,
                fontSize: isNarrow ? 10 : 11,
                fontWeight: 600,
              }}
            >
              {row.rankTitle}
            </span>
          </Tooltip>
          {typeof coRank === "number" && (
            <span style={{ fontSize: isNarrow ? 10 : 11, color: "#6b7280", fontWeight: 600 }}>co.#{coRank}</span>
          )}
          {!isNarrow && (row.branch || row.team) && (
            <span style={{ fontSize: 11, color: "#6b7280" }}>
              {[row.branch, row.team && `Team ${row.team}`].filter(Boolean).join(" · ")}
            </span>
          )}
          {isNarrow && badgeIcons}
        </div>
        {!isNarrow && <div style={{ marginTop: 4 }}>{badgeIcons}</div>}
        {milestone && (
          <div style={{ marginTop: 3, fontSize: 11, color: "#6b7280" }}>
            next: <b>{milestone}</b>
          </div>
        )}
      </div>

      <ProgressRing pct={row.pct} size={ringSize} holeBg={containerStyle?.background ? String(containerStyle.background) : "#fff"} />
    </div>
  );
}
