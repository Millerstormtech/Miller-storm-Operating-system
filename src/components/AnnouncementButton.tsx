import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";

// Header button, next to the Tickets button, that opens the announcement
// composer. Admin, C-Level, Branch Manager and Sales Team Lead can post
// (each scoped server-side to their own audience — see pages/api/announcements.ts),
// so it's hidden for everyone else.
const ANNOUNCEMENT_ROUTE_BY_ROLE: Record<string, string> = {
  admin: "/admin/announcements",
  "c-level": "/c-level/announcements",
  "branch-manager": "/branch-manager/announcements",
  "sales-team-lead": "/manager/announcements",
};

export function AnnouncementButton() {
  const router = useRouter();
  const { user } = useAuth();
  const role = user?.role || "";
  const href = ANNOUNCEMENT_ROUTE_BY_ROLE[role];
  if (!href) return null;

  return (
    <button
      type="button"
      className="ticket-btn"
      onClick={() => router.push(href)}
      title="Post a company-wide announcement"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
        lineHeight: 1,
        background: "#dc2626",
        color: "var(--text-inverse)",
        border: "none",
        borderRadius: 6,
        padding: "9px 16px",
        fontWeight: 700,
        fontSize: 14,
        cursor: "pointer",
        marginRight: 8,
      }}
    >
      📢 <span className="ticket-btn-text">Announcements</span>
    </button>
  );
}
