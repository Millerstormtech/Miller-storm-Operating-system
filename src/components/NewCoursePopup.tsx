import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  metadata?: { courseId?: string; courseName?: string; watchUrl?: string; lessonId?: string };
};

/**
 * Red "new course" pop-up shown on the sales & manager dashboards.
 *
 * It keeps appearing on every login until the user clicks "Check it out"
 * (which marks the notification read and takes them to training). Closing with
 * the X only hides it for the current view — it returns on the next login,
 * because it stays UNREAD until the course is actually opened.
 *
 * These `course_added` notifications are intentionally NOT shown in the bell.
 */
export function NewCoursePopup() {
  const { user } = useAuth();
  const router = useRouter();
  const [notif, setNotif] = useState<Notification | null>(null);
  // Ids the user closed with the X this session — hidden until next login.
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id) return;
    let active = true;

    async function check() {
      try {
        const res = await fetch("/api/notifications");
        if (!res.ok) return;
        const data: Notification[] = await res.json();
        // Newest unread "course_added" the user hasn't closed this session
        // (list is already sorted newest-first).
        const fresh = data.find(
          (n) => n.type === "course_added" && !n.read && !dismissedIds.has(n.id)
        );
        if (active) setNotif(fresh || null);
      } catch {
        /* ignore */
      }
    }

    check();
    // Re-check every 20s so a freshly published course pops up WITHOUT a manual
    // page refresh.
    const interval = setInterval(check, 20000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [user?.id, dismissedIds]);

  if (!notif) return null;

  const baseWatchUrl = notif.metadata?.watchUrl || "/sales/training";
  const courseId = notif.metadata?.courseId;
  const lessonId = notif.metadata?.lessonId;
  // Deep-link into the course (courseId is always present, even on older
  // notifications) and straight to the new lesson/quiz when we also have the
  // page id. This guarantees "Check it out" at least opens the course.
  const params = new URLSearchParams();
  if (courseId) params.set("courseId", courseId);
  if (lessonId) params.set("lessonId", lessonId);
  const qs = params.toString();
  const watchUrl = qs ? `${baseWatchUrl}?${qs}` : baseWatchUrl;
  const courseName = notif.metadata?.courseName;

  async function watchNow() {
    if (!notif) return;
    try {
      await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: notif.id }),
      });
    } catch {
      /* ignore — still navigate */
    }
    router.push(watchUrl);
  }

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
          const id = notif.id;
          setDismissedIds((prev) => new Set(prev).add(id));
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

      <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6, paddingRight: 20 }}>
        {notif.title}
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.5, opacity: 0.95, marginBottom: courseName ? 8 : 14 }}>
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
        onClick={watchNow}
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
        ▶ Check it out
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
