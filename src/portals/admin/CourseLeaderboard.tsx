import { useEffect, useState, useRef } from "react";
import html2canvas from "html2canvas";

type LeaderRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  done: number;
  total: number;
  pct: number;
};

type CourseOption = { id: string; title: string };
type LessonPage = { id: string; title: string };
type UserOption = { id: string; name: string; email: string };

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export function CourseLeaderboard() {
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<CourseOption | null>(null);
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);

  const [hiddenUsers, setHiddenUsers] = useState<Set<string>>(new Set());
  const [showHiddenList, setShowHiddenList] = useState(false);

  useEffect(() => {
    fetch("/api/admin/ui-prefs?key=hiddenLeaderboardUsers")
      .then(r => r.ok ? r.json() : { hiddenIds: [] })
      .then(data => setHiddenUsers(new Set(data.hiddenIds || [])))
      .catch(() => {});
  }, []);

  async function saveHiddenUsers(newSet: Set<string>) {
    setHiddenUsers(newSet);
    await fetch("/api/admin/ui-prefs?key=hiddenLeaderboardUsers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hiddenIds: [...newSet] })
    }).catch(() => {});
  }

  const [showHiddenSection, setShowHiddenSection] = useState(false);
  const [showAdminControls, setShowAdminControls] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

  // Load courses on mount
  const [showOverride, setShowOverride] = useState(false);
  const [overrideUsers, setOverrideUsers] = useState<UserOption[]>([]);
  const [overrideSelectedUser, setOverrideSelectedUser] = useState<UserOption | null>(null);
  const [overrideLessons, setOverrideLessons] = useState<LessonPage[]>([]);
  const [overrideChecked, setOverrideChecked] = useState<Set<string>>(new Set());
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [allCoursesRaw, setAllCoursesRaw] = useState<any[]>([]);
  const [showFormatPicker, setShowFormatPicker] = useState(false);
  const [show100Club, setShow100Club] = useState(true);
  const [showHideModal, setShowHideModal] = useState(false);
  const [hideSelection, setHideSelection] = useState<Set<string>>(new Set());
  const tableRef = useRef<HTMLDivElement>(null);

  function hideUser(userId: string) {
    const newHidden = new Set(hiddenUsers);
    newHidden.add(userId);
    saveHiddenUsers(newHidden);
  }

  function unhideUser(userId: string) {
    const newHidden = new Set(hiddenUsers);
    newHidden.delete(userId);
    saveHiddenUsers(newHidden);
  }

  function toggleUserSelection(userId: string) {
    setSelectedUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) newSet.delete(userId);
      else newSet.add(userId);
      return newSet;
    });
  }

  function saveSelectedUsers() {
    const newHidden = new Set([...hiddenUsers, ...selectedUsers]);
    saveHiddenUsers(newHidden);
    setSelectedUsers(new Set());
    setShowAdminControls(false);
  }

  // Load courses on mount
  useEffect(() => {
    fetch("/api/courses")
      .then((r) => r.ok ? r.json() : [])
      .then((data: any[]) => {
        setAllCoursesRaw(data);
        const published = data
          .filter((c) => c.status === "published")
          .map((c) => ({ id: c.id, title: c.title }));
        setCourses(published);
        if (published.length) loadLeaderboard(published[0], data);
      })
      .catch(console.error);
  }, []);

  // Close picker on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function loadLeaderboard(course: CourseOption, allCoursesData?: any[]) {
    setIsLoading(true);
    setSelectedCourse(course);
    setIsPickerOpen(false);
    setSearch("");
    try {
      // Use new optimized leaderboard API
      const leaderboardRes = await fetch(`/api/leaderboard?courseId=${course.id}`);
      if (leaderboardRes.ok) {
        const data = await leaderboardRes.json();
        setTotalUsers(data.rows?.length || 0);
        setRows(data.rows || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  // Open override modal
  async function openOverride() {
    if (!selectedCourse) return;
    setShowOverride(true);
    setOverrideSelectedUser(null);
    setOverrideChecked(new Set());
    setOverrideLoading(true);
    try {
      const usersRes = await fetch("/api/users").then((r) => r.ok ? r.json() : []);
      const eligible = (Array.isArray(usersRes) ? usersRes : [])
        .filter((u: any) => !u.deleted && !u.suspended &&
          (u.role === "manager" || u.role === "sales" ||
            (u.roles || []).some((r: string) => r === "manager" || r === "sales")))
        .map((u: any) => ({ id: u.id, name: u.name || u.email, email: u.email }))
        .sort((a: UserOption, b: UserOption) => a.name.localeCompare(b.name));
      setOverrideUsers(eligible);

      // Build lesson list from raw course data
      const raw = allCoursesRaw.find((c: any) => c.id === selectedCourse.id);
      
      // Get published folders
      const publishedFolderIds = new Set(
        (raw?.folders || [])
          .filter((f: any) => f.status === "published")
          .map((f: any) => f.id)
      );
      
      // Filter lessons: must be published, not a quiz, and either has no folder or is in a published folder
      const lessons: LessonPage[] = raw
        ? (raw.pages || [])
            .filter((p: any) => 
              p.status === "published" && 
              !p.isQuiz && 
              (!p.folderId || publishedFolderIds.has(p.folderId))
            )
            .map((p: any) => ({ id: p.id, title: p.title || `Lesson ${p.order ?? ""}` }))
        : [];
      setOverrideLessons(lessons);
    } catch (e) {
      console.error(e);
    } finally {
      setOverrideLoading(false);
    }
  }

  // When user is selected in override, load their existing progress
  async function selectOverrideUser(user: UserOption) {
    setOverrideSelectedUser(user);
    if (!selectedCourse) return;
    try {
      const res = await fetch(`/api/course-progress?userId=${user.id}&courseIds=${selectedCourse.id}`);
      const data = res.ok ? await res.json() : {};
      const completed: string[] = data[selectedCourse.id]?.completedPages || [];
      setOverrideChecked(new Set(completed));
    } catch {
      setOverrideChecked(new Set());
    }
  }

  function toggleLesson(id: string) {
    setOverrideChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    setOverrideChecked(new Set(overrideLessons.map((l) => l.id)));
  }

  function selectNone() {
    setOverrideChecked(new Set());
  }

  async function takeScreenshot(format: "jpeg" | "png") {
    if (!tableRef.current) return;
    setShowFormatPicker(false);
    const canvas = await html2canvas(tableRef.current, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const mimeType = format === "png" ? "image/png" : "image/jpeg";
    const ext = format === "jpeg" ? "jpg" : "png";
    const link = document.createElement("a");
    link.download = `leaderboard-${selectedCourse?.title || "export"}.${ext}`;
    link.href = canvas.toDataURL(mimeType, 0.95);
    link.click();
  }

  function exportCSV() {
    const visible = rows.filter(r => !hiddenUsers.has(r.id));
    const headers = ["Rank", "Name", "Email", "Role", "Lessons Completed", "Total Lessons", "Progress %"];
    const csvRows = visible.map((row, idx) => [
      idx + 1,
      `"${row.name}"`,
      `"${row.email}"`,
      row.role,
      row.done,
      row.total,
      row.pct
    ]);
    const csv = [headers.join(","), ...csvRows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.download = `leaderboard-${selectedCourse?.title || "export"}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function saveOverride() {
    if (!overrideSelectedUser || !selectedCourse) return;
    setOverrideSaving(true);
    try {
      const completedPages = Array.from(overrideChecked);
      const allDone = completedPages.length === overrideLessons.length && overrideLessons.length > 0;
      await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: overrideSelectedUser.id,
          courseId: selectedCourse.id,
          completedPages,
          ...(allDone ? { courseCompleted: true } : {}),
        }),
      });
      setShowOverride(false);
      await loadLeaderboard(selectedCourse);
    } catch (e) {
      console.error(e);
    } finally {
      setOverrideSaving(false);
    }
  }

  const filteredCourses = courses.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  const enrolled = rows.filter((r) => r.done > 0).length;

  return (
    <div>
      {/* Leaderboard card */}
      <div style={{
        background: "#fff", border: "1px solid #e5e7eb",
        borderRadius: 12,
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        position: "relative",
      }}>
        {/* Header row */}
        <div style={{
          padding: "16px 24px", background: "#f8fafc",
          borderBottom: "1px solid #e5e7eb",
          display: "flex", justifyContent: "space-between",
          alignItems: "center", flexWrap: "wrap", gap: 12,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>🏆 Course Leaderboard</div>
            {selectedCourse && (
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{selectedCourse.title}</div>
            )}
          </div>

          {/* Header right side buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>

          {/* Invisible Admin Control Button - positioned before screenshot */}
          <button
            onClick={() => setShowAdminControls(!showAdminControls)}
            style={{
              opacity: 0, width: 50, height: 40, border: "none",
              background: "none", cursor: "pointer"
            }}
          />

          {/* Admin Controls */}
          {showAdminControls && (
            <>
              <span style={{ fontSize: 12, color: "#6b7280" }}>Select users to hide:</span>
              <button
                onClick={saveSelectedUsers}
                disabled={selectedUsers.size === 0}
                style={{
                  padding: "6px 12px", fontSize: 12, borderRadius: 6,
                  border: "1px solid #10b981", background: selectedUsers.size > 0 ? "#10b981" : "#d1d5db",
                  color: selectedUsers.size > 0 ? "#fff" : "#9ca3af",
                  cursor: selectedUsers.size > 0 ? "pointer" : "not-allowed"
                }}
              >
                Save ({selectedUsers.size})
              </button>
              <button
                onClick={() => { setSelectedUsers(new Set()); setShowAdminControls(false); }}
                style={{
                  padding: "6px 12px", fontSize: 12, borderRadius: 6,
                  border: "1px solid #ef4444", background: "#ef4444",
                  color: "#fff", cursor: "pointer"
                }}
              >
                Cancel
              </button>
            </>
          )}

          {/* Screenshot button */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowFormatPicker(p => !p)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 8,
                border: "1px solid #d1d5db", background: "#fff",
                fontSize: 13, fontWeight: 600, color: "#374151",
                cursor: "pointer",
              }}
            >
              📸 Screenshot
            </button>
            {showFormatPicker && (
              <div style={{
                position: "absolute", right: 0, top: "calc(100% + 6px)",
                background: "#fff", border: "1px solid #e5e7eb",
                borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                zIndex: 100, overflow: "hidden", minWidth: 120,
              }}>
                {(["jpeg", "jpg", "png"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => takeScreenshot(fmt === "jpg" ? "jpeg" : fmt)}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "9px 16px", border: "none", background: "#fff",
                      fontSize: 13, cursor: "pointer", color: "#111827",
                      borderBottom: fmt !== "png" ? "1px solid #f3f4f6" : "none",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                    onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
                  >
                    Save as .{fmt}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Export CSV button */}
          <button
            onClick={exportCSV}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 8,
              border: "1px solid #d1d5db", background: "#fff",
              fontSize: 13, fontWeight: 600, color: "#374151",
              cursor: "pointer",
            }}
          >
            📥 Export CSV
          </button>

          {/* Course filter button + picker */}
          <div style={{ position: "relative" }} ref={pickerRef}>
            <button
              onClick={() => setIsPickerOpen((p) => !p)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 16px", borderRadius: 8,
                border: "1px solid #d1d5db", background: "#fff",
                fontSize: 13, fontWeight: 600, color: "#374151",
                cursor: "pointer",
              }}
            >
              🎯 Filter Course <span style={{ color: "#9ca3af" }}>▼</span>
            </button>

            {isPickerOpen && (
              <div style={{
                position: "absolute", right: 0, top: "calc(100% + 6px)",
                width: 320, background: "#fff",
                border: "1px solid #e5e7eb", borderRadius: 10,
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                zIndex: 100, overflow: "hidden",
              }}>
                <div style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                  <input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search courses..."
                    style={{
                      width: "100%", padding: "7px 10px",
                      border: "1px solid #d1d5db", borderRadius: 6,
                      fontSize: 13, outline: "none", boxSizing: "border-box",
                    }}
                  />
                </div>
                <div style={{ maxHeight: 260, overflowY: "auto" }}>
                  {filteredCourses.length === 0 ? (
                    <div style={{ padding: "16px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                      No courses found
                    </div>
                  ) : (
                    filteredCourses.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => loadLeaderboard(c)}
                        style={{
                          width: "100%", textAlign: "left",
                          padding: "10px 16px", border: "none",
                          background: selectedCourse?.id === c.id ? "#eff6ff" : "#fff",
                          color: selectedCourse?.id === c.id ? "#2563eb" : "#111827",
                          fontWeight: selectedCourse?.id === c.id ? 600 : 400,
                          fontSize: 13, cursor: "pointer",
                          borderBottom: "1px solid #f9fafb",
                        }}
                      >
                        {selectedCourse?.id === c.id && "✓ "}{c.title}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          </div>
        </div>

        {/* Table wrapper for screenshot */}
        <div ref={tableRef}>

        {/* 100 Club Section */}
        {(() => {
          const clubMembers = rows.filter(r => r.pct === 100 && !hiddenUsers.has(r.id));
          if (clubMembers.length === 0) return null;
          return (
            <div style={{ borderBottom: "2px solid #d1fae5" }}>
              <button
                onClick={() => setShow100Club(p => !p)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 24px", border: "none", cursor: "pointer",
                  background: "linear-gradient(90deg, #ecfdf5, #f0fdf4)",
                  borderBottom: show100Club ? "1px solid #d1fae5" : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    background: "linear-gradient(135deg, #059669, #10b981)",
                    color: "#fff", borderRadius: "0 6px 6px 0",
                    padding: "4px 12px 4px 8px", fontSize: 12, fontWeight: 700,
                    letterSpacing: 0.5, position: "relative", marginLeft: 8,
                    boxShadow: "0 2px 6px rgba(16,185,129,0.35)",
                  }}>
                    <div style={{ position: "absolute", left: -8, top: 0, bottom: 0, width: 0, height: 0, borderTop: "13px solid transparent", borderBottom: "13px solid transparent", borderRight: "8px solid #059669" }} />
                    <div style={{ position: "absolute", left: -2, top: "50%", transform: "translateY(-50%)", width: 4, height: 4, borderRadius: "50%", background: "#fff", opacity: 0.8 }} />
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    100 Club
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#065f46" }}>{clubMembers.length} member{clubMembers.length !== 1 ? "s" : ""} completed this course</span>
                </div>
                <span style={{ fontSize: 13, color: "#059669", fontWeight: 600 }}>{show100Club ? "▲ Hide" : "▼ Show"}</span>
              </button>
              {show100Club && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f0fdf4" }}>
                        {["#", "User", "Role", "Lessons", "Progress"].map(h => (
                          <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#065f46", borderBottom: "1px solid #d1fae5", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {clubMembers.map((row, idx) => (
                        <tr key={row.id} style={{
                          background: idx % 2 === 0 ? "#f0fdf4" : "#ecfdf5",
                        }}>
                          <td style={{ padding: "10px 16px", borderBottom: "1px solid #d1fae5", color: "#059669", fontWeight: 700 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              {showAdminControls && (
                                <input
                                  type="checkbox"
                                  checked={selectedUsers.has(row.id)}
                                  onChange={() => toggleUserSelection(row.id)}
                                  style={{ cursor: "pointer" }}
                                />
                              )}
                              {idx + 1}
                            </div>
                          </td>
                          <td style={{ padding: "10px 16px", borderBottom: "1px solid #d1fae5" }}>
                            <div style={{ fontWeight: 600, color: "#111827" }}>{row.name}</div>
                            <div style={{ fontSize: 11, color: "#9ca3af" }}>{row.email}</div>
                          </td>
                          <td style={{ padding: "10px 16px", borderBottom: "1px solid #d1fae5" }}>
                            <span style={{ padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: row.role === "manager" ? "#ede9fe" : "#dbeafe", color: row.role === "manager" ? "#6d28d9" : "#1d4ed8", textTransform: "capitalize" }}>{row.role}</span>
                          </td>
                          <td style={{ padding: "10px 16px", borderBottom: "1px solid #d1fae5", color: "#065f46", fontWeight: 600 }}>{row.done} / {row.total}</td>
                          <td style={{ padding: "10px 16px", borderBottom: "1px solid #d1fae5", minWidth: 140 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ flex: 1, height: 8, borderRadius: 999, background: "#d1fae5", overflow: "hidden" }}>
                                <div style={{ width: "100%", height: "100%", background: "#10b981" }} />
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#059669", minWidth: 36 }}>100%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}

        {/* Main Leaderboard - below 100% only */}
        {isLoading ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 200 }}>
            <div style={{ textAlign: "center" }}>
              <div className="spinner" style={{ margin: "0 auto 12px" }} />
              <div style={{ color: "#6b7280", fontSize: 13 }}>Loading leaderboard...</div>
            </div>
          </div>
        ) : (
          (() => {
            const mainRows = rows.filter(r => r.pct < 100 && !hiddenUsers.has(r.id));
            if (mainRows.length === 0) return (
              <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                All users have completed this course!
              </div>
            );
            return (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      {["Rank", "User", "Role", "Lessons Completed", "Progress"].map((h) => (
                        <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontWeight: 600, color: "#374151", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mainRows.map((row, idx) => {
                      const rank = idx + 1;
                      return (
                        <tr key={row.id} style={{
                          background: rank === 1 ? "#fffbeb" : rank === 2 ? "#f9fafb" : rank === 3 ? "#fafafa" : "#fff",
                        }}>
                          <td style={{ padding: "11px 16px", borderBottom: "1px solid #f3f4f6", width: 60 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              {showAdminControls && (
                                <input
                                  type="checkbox"
                                  checked={selectedUsers.has(row.id)}
                                  onChange={() => toggleUserSelection(row.id)}
                                  style={{ cursor: "pointer" }}
                                />
                              )}
                              {MEDAL[rank] ? <span style={{ fontSize: 18 }}>{MEDAL[rank]}</span> : (
                                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: "50%", background: "#f3f4f6", color: "#6b7280", fontSize: 12, fontWeight: 700 }}>{rank}</span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: "11px 16px", borderBottom: "1px solid #f3f4f6" }}>
                            <div style={{ fontWeight: 600, color: "#111827" }}>{row.name}</div>
                            <div style={{ fontSize: 11, color: "#9ca3af" }}>{row.email}</div>
                          </td>
                          <td style={{ padding: "11px 16px", borderBottom: "1px solid #f3f4f6" }}>
                            <span style={{ padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: row.role === "manager" ? "#ede9fe" : "#dbeafe", color: row.role === "manager" ? "#6d28d9" : "#1d4ed8", textTransform: "capitalize" }}>{row.role}</span>
                          </td>
                          <td style={{ padding: "11px 16px", borderBottom: "1px solid #f3f4f6", whiteSpace: "nowrap", color: "#374151" }}>{row.done} / {row.total}</td>
                          <td style={{ padding: "11px 16px", borderBottom: "1px solid #f3f4f6", minWidth: 160 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ flex: 1, height: 8, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}>
                                <div style={{ width: `${row.pct}%`, height: "100%", background: row.pct > 0 ? "#f59e0b" : "#e5e7eb", transition: "width 0.3s" }} />
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#374151", minWidth: 36 }}>{row.pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()
        )}
        </div>

        {/* Bottom buttons row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px 16px 24px" }}>
          {/* Hidden Users toggle button - Left side (invisible) */}
          {hiddenUsers.size > 0 ? (
            <button
              onClick={() => setShowHiddenSection(p => !p)}
              style={{
                padding: "6px 14px", borderRadius: 6,
                border: "1px solid #fff", background: "#fff",
                color: "#fff", fontSize: 12, fontWeight: 600,
                cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {showHiddenSection ? "▼" : "▶"} Hidden Users ({hiddenUsers.size})
            </button>
          ) : (
            <div></div>
          )}

          {/* Override button - Right side (invisible) */}
          <button
            onClick={openOverride}
            style={{
              padding: "6px 14px", borderRadius: 6,
              border: "1px solid #fff", boxShadow: "none",
              background: "#fff", color: "#fff",
              cursor: "pointer", fontSize: 12, fontWeight: 600,
              userSelect: "none", outline: "none",
            }}
          >
            ⚙ Override
          </button>
        </div>

      </div>

      {/* Hidden Users Section */}
      {hiddenUsers.size > 0 && showHiddenSection && (
        <div style={{ marginTop: 24 }}>
          <div style={{
              background: "#fff", border: "1px solid #e5e7eb",
              borderRadius: 12,
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            }}>
              {/* Header */}
              <div style={{
                padding: "16px 24px", background: "#fef3c7",
                borderBottom: "1px solid #e5e7eb",
                display: "flex", justifyContent: "space-between",
                alignItems: "center",
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#92400e" }}>👁️ Hidden Users</div>
                  <div style={{ fontSize: 13, color: "#78350f", marginTop: 2 }}>
                    These users are hidden from the main leaderboard
                  </div>
                </div>
                <button
                  onClick={() => setShowHiddenSection(false)}
                  style={{
                    padding: "6px 12px", fontSize: 12, borderRadius: 6,
                    border: "1px solid #ef4444", background: "#ef4444",
                    color: "#fff", cursor: "pointer", fontWeight: 600
                  }}
                >
                  Close
                </button>
              </div>

              {/* Table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      {["Rank", "User", "Role", "Lessons Completed", "Progress", "Actions"].map((h) => (
                        <th key={h} style={{
                          padding: "11px 16px", textAlign: "left",
                          fontWeight: 600, color: "#374151",
                          borderBottom: "1px solid #e5e7eb",
                          whiteSpace: "nowrap",
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const hiddenRows = rows.filter(row => hiddenUsers.has(row.id)).sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));
                      const hidden100 = hiddenRows.filter(r => r.pct === 100);
                      const hiddenBelow = hiddenRows.filter(r => r.pct < 100);
                      const hiddenSorted = [...hidden100, ...hiddenBelow];
                      let hiddenBelowRank = 0;
                      return hiddenSorted.map((row, idx) => {
                      const is100 = row.pct === 100;
                      if (!is100) hiddenBelowRank++;
                      const originalRank = is100 ? null : hiddenBelowRank;
                      return (
                        <tr key={row.id} style={{
                          background: is100 ? "#f0fdf4" : idx % 2 === 0 ? "#fff" : "#fafafa",
                        }}>
                          <td style={{ padding: "11px 16px", borderBottom: "1px solid #f3f4f6", width: 80 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {is100 ? (
                                <div style={{
                                  display: "inline-flex", alignItems: "center", gap: 5,
                                  background: "linear-gradient(135deg, #059669, #10b981)",
                                  color: "#fff", borderRadius: "0 6px 6px 0",
                                  padding: "4px 10px 4px 8px", fontSize: 11, fontWeight: 700,
                                  letterSpacing: 0.5, whiteSpace: "nowrap",
                                  boxShadow: "0 2px 6px rgba(16,185,129,0.35)",
                                  position: "relative", marginLeft: 8,
                                }}>
                                  <div style={{ position: "absolute", left: -8, top: 0, bottom: 0, width: 0, height: 0, borderTop: "12px solid transparent", borderBottom: "12px solid transparent", borderRight: "8px solid #059669" }} />
                                  <div style={{ position: "absolute", left: -2, top: "50%", transform: "translateY(-50%)", width: 4, height: 4, borderRadius: "50%", background: "#fff", opacity: 0.8 }} />
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                  100 Club
                                </div>
                              ) : MEDAL[originalRank!] ? (
                                <span style={{ fontSize: 18 }}>{MEDAL[originalRank!]}</span>
                              ) : (
                                <span style={{
                                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                                  width: 24, height: 24, borderRadius: "50%",
                                  background: "#f3f4f6", color: "#6b7280",
                                  fontSize: 12, fontWeight: 700,
                                }}>{originalRank}</span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: "11px 16px", borderBottom: "1px solid #f3f4f6" }}>
                            <div style={{ fontWeight: 600, color: "#111827" }}>{row.name}</div>
                            <div style={{ fontSize: 11, color: "#9ca3af" }}>{row.email}</div>
                          </td>
                          <td style={{ padding: "11px 16px", borderBottom: "1px solid #f3f4f6" }}>
                            <span style={{
                              padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                              background: row.role === "manager" ? "#ede9fe" : "#dbeafe",
                              color: row.role === "manager" ? "#6d28d9" : "#1d4ed8",
                              textTransform: "capitalize",
                            }}>
                              {row.role}
                            </span>
                          </td>
                          <td style={{ padding: "11px 16px", borderBottom: "1px solid #f3f4f6", whiteSpace: "nowrap", color: "#374151" }}>
                            {row.done} / {row.total}
                          </td>
                          <td style={{ padding: "11px 16px", borderBottom: "1px solid #f3f4f6", minWidth: 160 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ flex: 1, height: 8, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}>
                                <div style={{
                                  width: `${row.pct}%`, height: "100%",
                                  background: row.pct === 100 ? "#10b981" : row.pct > 0 ? "#f59e0b" : "#e5e7eb",
                                  transition: "width 0.3s",
                                }} />
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#374151", minWidth: 36 }}>{row.pct}%</span>
                            </div>
                          </td>
                          <td style={{ padding: "11px 16px", borderBottom: "1px solid #f3f4f6" }}>
                            <button
                              onClick={() => unhideUser(row.id)}
                              style={{
                                padding: "6px 14px", borderRadius: 6,
                                border: "1px solid #3b82f6",
                                background: "#eff6ff", color: "#2563eb",
                                cursor: "pointer", fontSize: 12, fontWeight: 600,
                              }}
                            >
                              Unhide
                            </button>
                          </td>
                        </tr>
                      );
                    });})()}
                  </tbody>
                </table>
              </div>
            </div>
        </div>
      )}

      {/* Override Modal */}
      {showOverride && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 16,
        }}>
          <div style={{
            background: "#fff", borderRadius: 14,
            width: "100%", maxWidth: 560,
            maxHeight: "90vh", display: "flex", flexDirection: "column",
            boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            overflow: "hidden",
          }}>
            {/* Modal header */}
            <div style={{
              padding: "18px 24px", borderBottom: "1px solid #e5e7eb",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "#f8fafc",
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>Progress Override</div>
                {selectedCourse && (
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{selectedCourse.title}</div>
                )}
              </div>
              <button
                onClick={() => setShowOverride(false)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 20, color: "#9ca3af", lineHeight: 1, padding: 4,
                }}
              >×</button>
            </div>

            {/* Modal body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
              {overrideLoading ? (
                <div style={{ textAlign: "center", padding: 40, color: "#6b7280", fontSize: 13 }}>
                  Loading...
                </div>
              ) : (
                <>
                  {/* User picker */}
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                      Select User
                    </label>
                    <input
                      type="text"
                      placeholder="Search users..."
                      onChange={e => {
                        const val = e.target.value.toLowerCase();
                        const list = document.getElementById("override-user-list");
                        if (list) {
                          Array.from(list.children).forEach((child: any) => {
                            const text = child.getAttribute("data-search") || "";
                            child.style.display = text.includes(val) ? "flex" : "none";
                          });
                        }
                      }}
                      style={{ width: "100%", padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: "8px 8px 0 0", fontSize: 13, outline: "none", boxSizing: "border-box", borderBottom: "none" }}
                    />
                    <div
                      id="override-user-list"
                      style={{ border: "1px solid #d1d5db", borderRadius: "0 0 8px 8px", maxHeight: 200, overflowY: "auto", background: "#fff" }}
                    >
                      {overrideUsers.map((u, idx) => {
                        const isSelected = overrideSelectedUser?.id === u.id;
                        return (
                          <div
                            key={u.id}
                            data-search={`${u.name} ${u.email}`.toLowerCase()}
                            onClick={() => selectOverrideUser(u)}
                            style={{
                              display: "flex", alignItems: "center", gap: 10,
                              padding: "9px 12px", cursor: "pointer",
                              background: isSelected ? "#eff6ff" : idx % 2 === 0 ? "#fff" : "#fafafa",
                              borderBottom: idx < overrideUsers.length - 1 ? "1px solid #f3f4f6" : "none",
                              borderLeft: isSelected ? "3px solid #3b82f6" : "3px solid transparent",
                            }}
                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#f9fafb"; }}
                            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = idx % 2 === 0 ? "#fff" : "#fafafa"; }}
                          >
                            <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#e0e7ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#4f46e5", flexShrink: 0 }}>
                              {(u.name || u.email || "?")[0].toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
                              <div style={{ fontSize: 11, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                            </div>
                            {isSelected && <span style={{ fontSize: 12, color: "#3b82f6", fontWeight: 700, flexShrink: 0 }}>✓</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Lesson checklist */}
                  {overrideSelectedUser && (
                    <div>
                      <div style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        marginBottom: 10,
                      }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
                          Lesson Completions ({overrideChecked.size} / {overrideLessons.length})
                        </label>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={selectAll}
                            style={{
                              fontSize: 11, padding: "4px 10px", borderRadius: 6,
                              border: "1px solid #d1d5db", background: "#f9fafb",
                              color: "#374151", cursor: "pointer", fontWeight: 600,
                            }}
                          >All</button>
                          <button
                            onClick={selectNone}
                            style={{
                              fontSize: 11, padding: "4px 10px", borderRadius: 6,
                              border: "1px solid #d1d5db", background: "#f9fafb",
                              color: "#374151", cursor: "pointer", fontWeight: 600,
                            }}
                          >None</button>
                        </div>
                      </div>

                      {overrideLessons.length === 0 ? (
                        <div style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", padding: "20px 0" }}>
                          No published lessons found for this course.
                        </div>
                      ) : (
                        <div style={{
                          border: "1px solid #e5e7eb", borderRadius: 8,
                          overflow: "hidden", maxHeight: 320, overflowY: "auto",
                        }}>
                          {overrideLessons.map((lesson, idx) => {
                            const checked = overrideChecked.has(lesson.id);
                            return (
                              <label
                                key={lesson.id}
                                style={{
                                  display: "flex", alignItems: "center", gap: 12,
                                  padding: "10px 14px", cursor: "pointer",
                                  background: checked ? "#f0fdf4" : idx % 2 === 0 ? "#fff" : "#fafafa",
                                  borderBottom: idx < overrideLessons.length - 1 ? "1px solid #f3f4f6" : "none",
                                  transition: "background 0.15s",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleLesson(lesson.id)}
                                  style={{ width: 15, height: 15, accentColor: "#10b981", cursor: "pointer" }}
                                />
                                <span style={{ fontSize: 13, color: "#111827", flex: 1 }}>{lesson.title}</span>
                                {checked && (
                                  <span style={{ fontSize: 11, color: "#10b981", fontWeight: 600 }}>✓ Done</span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal footer */}
            <div style={{
              padding: "14px 24px", borderTop: "1px solid #e5e7eb",
              display: "flex", justifyContent: "flex-end", gap: 10,
              background: "#f8fafc",
            }}>
              <button
                onClick={() => setShowOverride(false)}
                style={{
                  padding: "8px 18px", borderRadius: 8,
                  border: "1px solid #d1d5db", background: "#fff",
                  fontSize: 13, fontWeight: 600, color: "#374151",
                  cursor: "pointer",
                }}
              >Cancel</button>
              <button
                onClick={saveOverride}
                disabled={!overrideSelectedUser || overrideSaving}
                style={{
                  padding: "8px 20px", borderRadius: 8,
                  border: "none",
                  background: !overrideSelectedUser || overrideSaving ? "#d1d5db" : "#2563eb",
                  fontSize: 13, fontWeight: 600, color: "#fff",
                  cursor: !overrideSelectedUser || overrideSaving ? "not-allowed" : "pointer",
                }}
              >
                {overrideSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
