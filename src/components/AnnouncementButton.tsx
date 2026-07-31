import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";

// Header button, next to the Tickets button, that opens the announcement
// composer. Only admin and c-level can post, so it's hidden for everyone else.
export function AnnouncementButton() {
  const router = useRouter();
  const { user } = useAuth();
  const role = user?.role;
  if (role !== "admin" && role !== "c-level") return null;

  const href = role === "admin" ? "/admin/announcements" : "/c-level/announcements";

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
        color: "#fff",
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
