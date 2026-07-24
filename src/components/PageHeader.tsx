import type { ReactNode } from "react";
import { resolvePageTitle } from "../lib/pageTitle";

/**
 * The unified page-title band. Rendered by the portal layouts, not by pages.
 * `actions` is the right-aligned slot (reserved for the guided-tour "?" in
 * the tours initiative).
 */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "20px 24px 0" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#111827" }}>{title}</h1>
        {subtitle ? <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>{subtitle}</p> : null}
      </div>
      {actions ? <div style={{ flexShrink: 0 }}>{actions}</div> : null}
    </div>
  );
}

export { resolvePageTitle };
