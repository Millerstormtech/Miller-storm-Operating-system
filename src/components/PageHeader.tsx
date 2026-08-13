import type { ReactNode } from "react";
import { resolvePageTitle } from "../lib/pageTitle";
import { TourButton } from "../portals/shared/guided-tour/TourButton";
import { useActiveTourId } from "../portals/shared/guided-tour/tourRegistry";

/**
 * The unified page-title band. Rendered by the portal layouts, not by pages.
 * `actions` is the right-aligned slot. The guided-tour "?" appears beside it
 * automatically whenever a tour is mounted anywhere on the page: the tour sits
 * below this component in the tree and announces itself through the registry,
 * because props cannot travel upward.
 */
export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: string; actions?: ReactNode; back?: ReactNode }) {
  const activeTourId = useActiveTourId();
  const hasRight = !!actions || !!activeTourId;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "20px 24px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        {back}
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: "clamp(28px, 3vw, 34px)", fontWeight: 900, fontFamily: '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif', letterSpacing: "0.01em", textTransform: "capitalize", lineHeight: 1.05, color: "var(--text-primary)" }}>{title}</h1>
          {subtitle ? <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>{subtitle}</p> : null}
        </div>
      </div>
      {hasRight ? (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
          {actions}
          {activeTourId ? <TourButton /> : null}
        </div>
      ) : null}
    </div>
  );
}

export { resolvePageTitle };
