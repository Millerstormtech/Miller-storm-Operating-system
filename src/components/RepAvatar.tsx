// src/components/RepAvatar.tsx
// A rep's photo, or their initial when there is no photo — or when the photo
// fails to load.
//
// That last case is the reason this exists. Leaderboard photos come from the
// Miller Storm user profile (NOT from RepCard, despite the common assumption),
// and a profile can hold a URL that no longer resolves. A plain <img> then
// draws the browser's broken-image glyph, which is what Colton Randolph's row
// was showing. Falling back to the initial keeps a stale link from ever
// looking like a bug.

import { useState } from "react";

export function RepAvatar({
  name,
  url,
  size,
  fontSize,
}: {
  name: string;
  url?: string;
  size: number;
  /** Defaults to roughly 40% of size, which reads well from 20px up. */
  fontSize?: number;
}) {
  const [failed, setFailed] = useState(false);
  const initial = (name || "").trim()[0]?.toUpperCase() || "?";
  const showPhoto = !!url && !failed;

  const base: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    flexShrink: 0,
    objectFit: "cover",
  };

  if (showPhoto) {
    return (
      <img
        src={url}
        alt=""
        style={base}
        // A dead URL must degrade to the initial, never to a broken glyph.
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{
        ...base,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#374151",
        color: "#fff",
        fontWeight: 700,
        fontSize: fontSize ?? Math.round(size * 0.4),
        lineHeight: 1,
      }}
    >
      {initial}
    </span>
  );
}
