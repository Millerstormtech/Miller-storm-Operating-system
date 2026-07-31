import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";
import { trainingRouteForRole } from "../lib/trainingRoute";

// Hard stop: a pop-up notification stops appearing once it is older than this,
// even if the user never acknowledged it. Applies to BOTH announcements and the
// existing new-course pop-up (deliberate behaviour change — course_added used to
// nag forever until "Check it out" was clicked).
const POPUP_MAX_AGE_DAYS = 14;

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt?: string;
  metadata?: {
    courseId?: string;
    courseName?: string;
    watchUrl?: string;
    lessonId?: string;
    link?: string;
    postedByName?: string;
  };
};

/**
 * Corner pop-up shown on every page of every portal (mounted once in _app.tsx).
 *
 * Handles two notification types:
 *   - `announcement` — a company-wide message from an admin / c-level. The action
 *     button opens metadata.link (external → new tab), or just says "Got it" when
 *     there's no link. Announcements ALSO show in the bell.
 *   - `course_added` — a newly published course. The action opens Training.
 *
 * The X hides it for the current view; it stays UNREAD so it returns on the next
 * login, until the action button is clicked (which marks it read) or it ages out
 * after POPUP_MAX_AGE_DAYS. If both types are outstanding, the announcement wins.
 */
export function NewCoursePopup() {
  const { user } = useAuth();
  const router = useRouter();
  const [notif, setNotif] = useState<Notification | null>(null);
  // Ids the user closed with the X during THIS login — kept in a ref so closing
  // one doesn't re-run the poller. Reset on every login/logout below.
  const dismissedRef = useRef<Set<string>>(new Set());

  // A session boundary (login OR logout) is a "next login" for the X rule.
  // Because logout/login are client-side navigations this component never
  // unmounts, so we reset here whenever the user changes: forget what was
  // dismissed and clear any shown pop-up. This runs BEFORE the poller effect
  // (declared first), so the fresh poll below sees an empty dismissed set —
  // an unread announcement reappears on the next login (until acknowledged or
  // it ages out at 14 days), and nothing lingers on the login screen.
  useEffect(() => {
    dismissedRef.current = new Set();
    setNotif(null);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;

    async function check() {
      try {
        const res = await fetch("/api/notifications");
        if (!res.ok) return;
        const data: Notification[] = await res.json();
        const now = Date.now();
        const eligible = data.filter(
          (n) =>
            (n.type === "announcement" || n.type === "course_added") &&
            !n.read &&
            !dismissedRef.current.has(n.id) &&
            // Hard stop: ignore anything older than POPUP_MAX_AGE_DAYS. Missing
            // createdAt is treated as in-range (fail-open) so nothing is hidden
            // by accident.
            (!n.createdAt || now - new Date(n.createdAt).getTime() <= POPUP_MAX_AGE_DAYS * 864e5)
        );
        // Announcement first, then course_added. The list is already newest-first.
        const fresh =
          eligible.find((n) => n.type === "announcement") ||
          eligible.find((n) => n.type === "course_added") ||
          null;
        if (active) setNotif(fresh || null);
      } catch {
        /* ignore */
      }
    }

    check();
    // Re-check every 20s so a fresh announcement / course pops up without a manual refresh.
    const interval = setInterval(check, 20000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [user?.id]);

  // Never render once logged out (user cleared), even if a stale notif remains.
  if (!user?.id || !notif) return null;

  const isAnnouncement = notif.type === "announcement";

  async function markRead(id: string) {
    try {
      await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      /* ignore */
    }
  }

  // course_added → open the recipient's own Training Center (deep-linked to the
  // course/lesson when we have the ids).
  const baseWatchUrl = trainingRouteForRole(user?.role);
  const courseId = notif.metadata?.courseId;
  const lessonId = notif.metadata?.lessonId;
  const params = new URLSearchParams();
  if (courseId) params.set("courseId", courseId);
  if (lessonId) params.set("lessonId", lessonId);
  const qs = params.toString();
  const watchUrl = qs ? `${baseWatchUrl}?${qs}` : baseWatchUrl;
  const courseName = notif.metadata?.courseName;

  async function onAction() {
    if (!notif) return;
    await markRead(notif.id);
    if (isAnnouncement) {
      const link = (notif.metadata?.link || "").trim();
      if (link) {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const isInternal = link.startsWith("/") || (origin && link.startsWith(origin));
        if (isInternal) {
          router.push(link.startsWith("/") ? link : link.replace(origin, "") || "/");
        } else {
          window.open(link, "_blank", "noopener,noreferrer");
        }
      }
      setNotif(null);
    } else {
      router.push(watchUrl);
    }
  }

  const actionLabel = isAnnouncement
    ? notif.metadata?.link
      ? "Learn more"
      : "Got it"
    : "▶ Check it out";

  return (
    <div
      style={{
        position: "fixed",
        top: 84,
        right: 24,
        zIndex: 4000,
        width: 340,
        maxWidth: "calc(100vw - 32px)",
        background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
        color: "#fff",
        borderRadius: 14,
        boxShadow: "0 18px 45px rgba(220,38,38,0.45)",
        padding: "18px 18px 16px",
        animation: "ncpSlideIn 0.35s ease-out",
      }}
      role="alert"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={() => {
          // Hide for THIS login only — stays unread, so it returns next login.
          dismissedRef.current.add(notif.id);
          setNotif(null);
        }}
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          background: "rgba(255,255,255,0.2)",
          border: "none",
          color: "#fff",
          width: 24,
          height: 24,
          borderRadius: "50%",
          cursor: "pointer",
          fontSize: 14,
          lineHeight: "24px",
          textAlign: "center",
        }}
      >
        ×
      </button>

      {isAnnouncement && (
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, opacity: 0.9, marginBottom: 4 }}>
          📢 ANNOUNCEMENT{notif.metadata?.postedByName ? ` · ${notif.metadata.postedByName}` : ""}
        </div>
      )}

      <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6, paddingRight: 20 }}>
        {notif.title}
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.5, opacity: 0.95, marginBottom: courseName ? 8 : 14, whiteSpace: "pre-wrap" }}>
        {notif.message}
      </div>
      {courseName && (
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            background: "rgba(255,255,255,0.18)",
            borderRadius: 8,
            padding: "6px 10px",
            marginBottom: 14,
          }}
        >
          📚 {courseName}
        </div>
      )}

      <button
        type="button"
        onClick={onAction}
        style={{
          width: "100%",
          background: "#fff",
          color: "#b91c1c",
          border: "none",
          borderRadius: 9,
          padding: "10px 12px",
          fontSize: 14,
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        {actionLabel}
      </button>

      <style jsx>{`
        @keyframes ncpSlideIn {
          from {
            opacity: 0;
            transform: translateY(-12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
