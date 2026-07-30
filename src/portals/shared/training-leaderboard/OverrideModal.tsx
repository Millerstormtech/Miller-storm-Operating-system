import { useEffect, useState } from "react";
import { isRankedUser } from "../../../lib/training/scoring";

type UserOption = { id: string; name: string; email: string };
type LessonPage = { id: string; title: string };
type CourseOption = { id: string; title: string };

/**
 * Admin-only manual fix tool: hand-mark a rep's VIDEO lessons as watched for
 * one course. Quizzes cannot be overridden (a pass requires real answers), so
 * under the videos+quizzes completion rule an override alone can no longer
 * complete a course. That is intentional (spec 2026-07-16 §4.4).
 */
export function OverrideModal({
  courses,
  onClose,
  onSaved,
}: {
  courses: CourseOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [courseId, setCourseId] = useState<string>(courses[0]?.id || "");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [allCoursesRaw, setAllCoursesRaw] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [lessons, setLessons] = useState<LessonPage[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [userSearch, setUserSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Eligible override targets: ranked reps only (primary role + scrub list).
  useEffect(() => {
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: any[]) => {
        const eligible = (Array.isArray(data) ? data : [])
          .filter(
            (u) => !u.deleted && !u.suspended && isRankedUser({ role: u.role, email: u.email })
          )
          .map((u) => ({ id: u.id, name: u.name || u.email, email: u.email }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setUsers(eligible);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Fetch the full course list ONCE. Per-courseId lookups below are then
  // synchronous over this cache, so a slow response for a previously
  // selected course can never resolve late and overwrite lessons with stale data.
  useEffect(() => {
    fetch("/api/courses?list=1")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: any[]) => setAllCoursesRaw(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, []);

  // Published, non-quiz lessons of the selected course (quizzes are not overridable).
  useEffect(() => {
    setLessons([]);
    const raw = allCoursesRaw.find((c) => c.id === courseId);
    const publishedFolderIds = new Set(
      (raw?.folders || []).filter((f: any) => f.status === "published").map((f: any) => f.id)
    );
    const pages: LessonPage[] = raw
      ? (raw.pages || [])
          .filter(
            (p: any) =>
              p.status === "published" &&
              !p.isQuiz &&
              (!p.folderId || publishedFolderIds.has(p.folderId))
          )
          .map((p: any) => ({ id: p.id, title: p.title || "Untitled lesson" }))
      : [];
    setLessons(pages);
  }, [courseId, allCoursesRaw]);

  // Selected user's progress for the selected course, via the BULK mode
  // (userIds=), which is the endpoint's only role-gated path for reading
  // another user's progress. The singular userId param is silently locked to
  // the caller since the security cleanup, so it would show the ADMIN'S own
  // ticks here, not the selected rep's. Guarded against races: if
  // courseId/selectedUser change again before this resolves, the stale
  // response is dropped instead of overwriting `checked`.
  useEffect(() => {
    if (!courseId || !selectedUser) return;
    setChecked(new Set());
    let cancelled = false;
    fetch(`/api/course-progress?userIds=${selectedUser.id}&courseIds=${courseId}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: any) => {
        if (cancelled) return;
        setChecked(new Set(data[selectedUser.id]?.[courseId]?.completedPages || []));
      })
      .catch(() => {
        if (!cancelled) setChecked(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, selectedUser]);

  function selectUser(user: UserOption) {
    setSelectedUser(user);
  }

  async function save() {
    if (!selectedUser || !courseId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          courseId,
          completedPages: Array.from(checked),
        }),
      });
      if (!res.ok) {
        setSaveError("Couldn't save. Try again.");
        return;
      }
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
      setSaveError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const visibleUsers = users.filter((u) =>
    `${u.name} ${u.email}`.toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          width: "100%",
          maxWidth: 560,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#f8fafc",
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>Progress Override</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
              Marks videos watched. Quizzes cannot be overridden, so this alone never completes a course.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9ca3af", lineHeight: 1, padding: 4 }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
            Course
          </label>
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            style={{ width: "100%", padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, marginBottom: 18 }}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>

          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#6b7280", fontSize: 13 }}>Loading…</div>
          ) : (
            <>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                Select user
              </label>
              <input
                type="text"
                placeholder="Search users…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: "8px 8px 0 0", fontSize: 13, outline: "none", boxSizing: "border-box", borderBottom: "none" }}
              />
              <div style={{ border: "1px solid #d1d5db", borderRadius: "0 0 8px 8px", maxHeight: 180, overflowY: "auto", background: "#fff", marginBottom: 18 }}>
                {visibleUsers.map((u, idx) => {
                  const isSelected = selectedUser?.id === u.id;
                  return (
                    <div
                      key={u.id}
                      onClick={() => selectUser(u)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "9px 12px",
                        cursor: "pointer",
                        background: isSelected ? "#eff6ff" : idx % 2 === 0 ? "#fff" : "#fafafa",
                        borderLeft: isSelected ? "3px solid #3b82f6" : "3px solid transparent",
                        fontSize: 13,
                      }}
                    >
                      <span style={{ fontWeight: 600, color: "#111827" }}>{u.name}</span>
                      <span style={{ fontSize: 11, color: "#6b7280" }}>{u.email}</span>
                    </div>
                  );
                })}
              </div>

              {selectedUser && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
                      Video completions ({checked.size} / {lessons.length})
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => setChecked(new Set(lessons.map((l) => l.id)))}
                        style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#f9fafb", color: "#374151", cursor: "pointer", fontWeight: 600 }}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setChecked(new Set())}
                        style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#f9fafb", color: "#374151", cursor: "pointer", fontWeight: 600 }}
                      >
                        None
                      </button>
                    </div>
                  </div>
                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", maxHeight: 260, overflowY: "auto" }}>
                    {lessons.map((lesson, idx) => {
                      const isChecked = checked.has(lesson.id);
                      return (
                        <label
                          key={lesson.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            padding: "10px 14px",
                            cursor: "pointer",
                            background: isChecked ? "#f0fdf4" : idx % 2 === 0 ? "#fff" : "#fafafa",
                            borderBottom: idx < lessons.length - 1 ? "1px solid #f3f4f6" : "none",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() =>
                              setChecked((prev) => {
                                const next = new Set(prev);
                                if (next.has(lesson.id)) next.delete(lesson.id);
                                else next.add(lesson.id);
                                return next;
                              })
                            }
                            style={{ width: 15, height: 15, accentColor: "#10b981", cursor: "pointer" }}
                          />
                          <span style={{ fontSize: 13, color: "#111827", flex: 1 }}>{lesson.title}</span>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end", gap: 10, background: "#f8fafc" }}>
          {saveError && (
            <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 600, marginRight: "auto" }}>
              {saveError}
            </span>
          )}
          <button
            onClick={onClose}
            style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!selectedUser || saving}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "none",
              background: !selectedUser || saving ? "#d1d5db" : "#2563eb",
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              cursor: !selectedUser || saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
