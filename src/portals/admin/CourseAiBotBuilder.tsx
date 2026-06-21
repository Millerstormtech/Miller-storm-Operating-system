import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";

const WorldMap = dynamic(() => import("../../components/WorldMap"), { ssr: false, loading: () => <div style={{ width: "100%", height: "100%", background: "#f3f4f6", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: "13px" }}>Loading map...</div> });

type Course = {
  id: string; title: string;
  folders: { id: string; title: string }[];
  pages: { id: string; title: string; folderId?: string; body?: string; transcript?: string }[];
};

type CourseBot = {
  id: string; name: string;
  selectedCourses: string[]; selectedFolders: string[]; selectedPages: string[];
  trainingText: string;
  model: string; creativity: number; systemPrompt: string;
  botTitle: string; welcomeMessage: string; placeholder: string; suggestions: string[];
  colorTheme: string; botAvatarUrl: string; chatIconSize: number;
  displayMessage: string; displayMessageEnabled: boolean; showWelcomePopup: boolean;
  removeSuggestionsAfterFirst: boolean; leadCollection: boolean;
  privacyPolicyEnabled: boolean; privacyActionText: string; privacyLinkText: string; privacyLink: string;
  enterMessage: string; attentionSound: string; attentionAnimation: string; immediatelyOpenChat: boolean;
  totalMessages: number;
  status?: 'published' | 'draft';
  teamMembers: string[]; teamMemberAccess: Record<string, string[]>;
};

type CourseBotView = "overview" | "chat-history" | "live-chat" | "courses" | "tune" | "test" | "appearance" | "settings";

const card: React.CSSProperties = { background: "#fff", borderRadius: "12px", border: "1px solid #e5e7eb", padding: "20px 24px" };
const btn: React.CSSProperties = { padding: "9px 18px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 600 };
const btnPrimary: React.CSSProperties = { ...btn, background: "#1f2937", color: "#fff" };
const btnSecondary: React.CSSProperties = { ...btn, background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "13px", outline: "none", boxSizing: "border-box", marginBottom: "12px" };

function useSaved() {
  const [saved, setSaved] = useState(false);
  function flash() { setSaved(true); setTimeout(() => setSaved(false), 2000); }
  return { saved, flash };
}

function SavedBadge({ visible }: { visible: boolean }) {
  return visible ? <span style={{ fontSize: 12, color: "#10b981", fontWeight: 600, marginLeft: 10 }}>✓ Saved!</span> : null;
}

function EditableBotName({ bot, onSave }: { bot: CourseBot; onSave: (u: Partial<CourseBot>) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(bot.botTitle || bot.name);

  function handleSave() {
    if (draft.trim()) {
      onSave({ botTitle: draft.trim(), name: draft.trim() });
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <div style={{ marginBottom: "12px" }}>
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
          style={{ width: "100%", padding: "4px 8px", fontSize: "14px", fontWeight: 700, border: "1px solid #d1d5db", borderRadius: 6, outline: "none", boxSizing: "border-box", marginBottom: 6 }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={handleSave} style={{ ...btnPrimary, padding: "4px 10px", fontSize: 12, flex: 1 }}>Save</button>
          <button onClick={() => setEditing(false)} style={{ ...btnSecondary, padding: "4px 10px", fontSize: 12, flex: 1 }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: "12px" }}>
      <div style={{ fontWeight: 700, fontSize: "15px", color: "#1f2937", flex: 1 }}>{bot.botTitle || bot.name}</div>
      <button onClick={() => { setDraft(bot.botTitle || bot.name); setEditing(true); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#6b7280" }} title="Edit name">✏️</button>
    </div>
  );
}

export function CourseAiBotBuilder() {
  const [bots, setBots] = useState<CourseBot[]>([]);
  const [selected, setSelected] = useState<CourseBot | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<CourseBotView>("courses");

  useEffect(() => { loadBots(); }, []);

  async function loadBots() {
    const res = await fetch("/api/course-ai-bots");
    if (res.ok) setBots(await res.json());
  }

  async function createBot() {
    if (!newName.trim()) return;
    const res = await fetch("/api/course-ai-bots", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() })
    });
    if (res.ok) {
      const bot = await res.json();
      setBots(prev => [bot, ...prev]);
      setSelected(bot); setShowCreate(false); setNewName("");
    }
  }

  async function saveBot(updates: Partial<CourseBot>) {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/course-ai-bots/${selected.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        const updated = await res.json();
        if (updates.status && !updated.status) updated.status = updates.status;
        setSelected(updated);
        setBots(prev => prev.map(b => b.id === updated.id ? updated : b));
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteBot(id: string) {
    if (!confirm("Delete this bot?")) return;
    await fetch(`/api/course-ai-bots/${id}`, { method: "DELETE" });
    setBots(prev => prev.filter(b => b.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  if (selected) {
    const navItems: { id: CourseBotView; label: string; icon: string; section?: string }[] = [
      { id: "overview",     label: "Overview",      icon: "📊", section: "ACTIVITY" },
      { id: "chat-history", label: "Chat History",  icon: "💬" },
      { id: "live-chat",    label: "Live Chat",     icon: "🟢" },
      { id: "courses",      label: "Add Courses",   icon: "📚", section: "TRAINING" },
      { id: "tune",         label: "Tune AI",       icon: "⚙️" },
      { id: "test",         label: "Test Your Bot", icon: "🧪", section: "DEPLOYMENT" },
      { id: "appearance",   label: "Appearance",    icon: "🎨" },
      { id: "settings",     label: "Settings",      icon: "🔧", section: "ADVANCED" },
    ];

    return (
      <div style={{ display: "flex", height: "calc(100vh - 64px)", overflow: "hidden" }}>
        {/* Sidebar */}
        <div style={{ width: 240, background: "#fff", borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
            <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: "14px", display: "flex", alignItems: "center", gap: "6px", marginBottom: "12px" }}>← All Bots</button>
            <EditableBotName bot={selected} onSave={saveBot} />
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: (selected.status || 'draft') === 'draft' ? '#1f2937' : '#9ca3af' }}>Draft</span>
              <div onClick={() => saveBot({ status: (selected.status || 'draft') === 'published' ? 'draft' : 'published' })}
                style={{ width: 44, height: 24, borderRadius: 12, cursor: "pointer", background: (selected.status || 'draft') === 'published' ? '#10b981' : '#d1d5db', position: "relative", transition: "all 0.3s" }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: (selected.status || 'draft') === 'published' ? 22 : 2, transition: "all 0.3s", boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }} />
              </div>
              <span style={{ fontSize: "12px", fontWeight: 600, color: (selected.status || 'draft') === 'published' ? '#10b981' : '#9ca3af' }}>Published</span>
            </div>
          </div>
          <nav style={{ padding: "8px 0", flex: 1, overflowY: "auto" }}>
            {navItems.map(item => (
              <div key={item.id}>
                {item.section && <div style={{ padding: "14px 20px 6px", fontSize: "11px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.1em" }}>{item.section}</div>}
                <button onClick={() => setActiveTab(item.id)}
                  style={{ width: "100%", textAlign: "left", padding: "11px 20px", border: "none", cursor: "pointer", fontSize: "14px", fontWeight: activeTab === item.id ? 600 : 500, background: activeTab === item.id ? "#f3f4f6" : "transparent", color: activeTab === item.id ? "#1f2937" : "#4b5563", borderLeft: activeTab === item.id ? "3px solid #1f2937" : "3px solid transparent", display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: 17 }}>{item.icon}</span>{item.label}
                </button>
              </div>
            ))}
          </nav>
          <div style={{ padding: "16px 20px", borderTop: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: "12px", color: "#9ca3af" }}>{selected.totalMessages || 0} messages</div>
          </div>
        </div>

        {/* Main */}
        <div style={{ flex: 1, overflowY: "auto", background: "#f9fafb" }}>
          {activeTab === "overview"     && <CourseOverviewPanel bot={selected} />}
          {activeTab === "chat-history" && <CourseChatHistoryPanel bot={selected} />}
          {activeTab === "live-chat"    && <CourseLiveChatPanel bot={selected} />}
          {activeTab === "courses"      && <AddCoursesPanel bot={selected} onSave={saveBot} saving={saving} />}
          {activeTab === "tune"         && <TunePanel bot={selected} onSave={saveBot} saving={saving} />}
          {activeTab === "test"         && <CourseTestPanel bot={selected} />}
          {activeTab === "appearance"   && <AppearancePanel bot={selected} onSave={saveBot} saving={saving} />}
          {activeTab === "settings"     && <CourseSettingsPanel bot={selected} onSave={saveBot} saving={saving} onDelete={() => deleteBot(selected.id)} />}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h2 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Course Bots</h2>
          <p style={{ color: "#6b7280", margin: "4px 0 0", fontSize: "14px" }}>Bots trained on your course content</p>
        </div>
        <button onClick={() => setShowCreate(true)} style={btnPrimary}>+ Create Bot</button>
      </div>

      {bots.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 20px", color: "#9ca3af" }}>
          <div style={{ fontSize: "56px", marginBottom: "16px" }}>🎓</div>
          <div style={{ fontSize: "18px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>No course bots yet</div>
          <div style={{ fontSize: "14px", marginBottom: "24px" }}>Create a bot and train it with your course content</div>
          <button onClick={() => setShowCreate(true)} style={btnPrimary}>Create Bot</button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
          {bots.map(bot => (
            <div key={bot.id} onClick={() => { setSelected(bot); setActiveTab("courses"); }}
              style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e5e7eb", padding: "20px", cursor: "pointer", position: "relative" }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)")}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: bot.colorTheme || "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "18px" }}>🎓</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "15px" }}>{bot.botTitle || bot.name}</div>
                    <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>{bot.selectedPages?.length || 0} lessons · {bot.totalMessages || 0} messages</div>
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); deleteBot(bot.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: "16px" }}>🗑</button>
              </div>
              {/* Status Badge - Bottom Right */}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: 600,
                  background: (bot.status || 'draft') === 'published' ? '#d1fae5' : '#fef3c7',
                  color: (bot.status || 'draft') === 'published' ? '#065f46' : '#92400e'
                }}>
                  {(bot.status || 'draft') === 'published' ? 'Published' : 'Draft'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", borderRadius: "14px", padding: "28px", width: "400px", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: "18px", fontWeight: 700 }}>Create Course Bot</h3>
            <p style={{ margin: "0 0 20px", color: "#6b7280", fontSize: "14px" }}>Give your course bot a name</p>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && createBot()} placeholder="e.g. Sales Training Bot" style={inputStyle} />
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
              <button onClick={() => { setShowCreate(false); setNewName(""); }} style={btnSecondary}>Cancel</button>
              <button onClick={createBot} disabled={!newName.trim()} style={{ ...btnPrimary, opacity: newName.trim() ? 1 : 0.5 }}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Add Courses Panel ────────────────────────────────────────────────────────

function AddCoursesPanel({ bot, onSave, saving }: { bot: CourseBot; onSave: (u: Partial<CourseBot>) => void; saving: boolean }) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set(bot.selectedPages || []));
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set(bot.selectedFolders || []));
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set(bot.selectedCourses || []));
  const [trainStatus, setTrainStatus] = useState<"idle" | "saving" | "done">("idle");

  useEffect(() => {
    fetch("/api/courses").then(r => r.ok ? r.json() : []).then(data => {
      setCourses(data); setLoading(false);
    });
  }, []);

  function toggleCourse(courseId: string, course: Course) {
    const allPageIds = (course.pages || []).map((p: any) => p.id);
    const allFolderIds = (course.folders || []).map((f: any) => f.id);
    const newCourses = new Set(selectedCourses);
    const newFolders = new Set(selectedFolders);
    const newPages = new Set(selectedPages);
    if (newCourses.has(courseId)) {
      newCourses.delete(courseId);
      allFolderIds.forEach(id => newFolders.delete(id));
      allPageIds.forEach(id => newPages.delete(id));
    } else {
      newCourses.add(courseId);
      allFolderIds.forEach(id => newFolders.add(id));
      allPageIds.forEach(id => newPages.add(id));
    }
    setSelectedCourses(newCourses); setSelectedFolders(newFolders); setSelectedPages(newPages);
  }

  function toggleFolder(folderId: string, course: Course) {
    const folderPages = (course.pages || []).filter((p: any) => p.folderId === folderId).map((p: any) => p.id);
    const newFolders = new Set(selectedFolders);
    const newPages = new Set(selectedPages);
    if (newFolders.has(folderId)) {
      newFolders.delete(folderId);
      folderPages.forEach(id => newPages.delete(id));
    } else {
      newFolders.add(folderId);
      folderPages.forEach(id => newPages.add(id));
    }
    setSelectedFolders(newFolders); setSelectedPages(newPages);
  }

  function togglePage(pageId: string) {
    const newPages = new Set(selectedPages);
    newPages.has(pageId) ? newPages.delete(pageId) : newPages.add(pageId);
    setSelectedPages(newPages);
  }

  async function save() {
    setTrainStatus("saving");
    await onSave({ selectedCourses: Array.from(selectedCourses), selectedFolders: Array.from(selectedFolders), selectedPages: Array.from(selectedPages) });
    setTrainStatus("done");
    setTimeout(() => setTrainStatus("idle"), 3000);
  }

  const totalSelected = selectedPages.size;
  const isTrained = !!bot.trainingText?.trim();

  return (
    <div style={{ padding: "32px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
        <div>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>Add Courses</h2>
          <p style={{ color: "#6b7280", fontSize: "14px", margin: 0 }}>Select lessons to train this bot. The bot will only answer questions based on selected content.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {totalSelected > 0 && <span style={{ fontSize: "13px", color: "#6b7280" }}>{totalSelected} lesson{totalSelected !== 1 ? "s" : ""} selected</span>}
          <button onClick={save} disabled={saving || trainStatus === "saving"}
            style={{ ...btnPrimary, opacity: saving || trainStatus === "saving" ? 0.7 : 1 }}>
            {trainStatus === "saving" || saving ? "Training..." : trainStatus === "done" ? "✓ Trained!" : "Save & Train"}
          </button>
        </div>
      </div>

      {/* Training status banner */}
      {isTrained && trainStatus === "idle" && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>✅</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#15803d" }}>Bot is trained</div>
            <div style={{ fontSize: 12, color: "#16a34a" }}>{bot.trainingText.length.toLocaleString()} characters of training data · {bot.selectedPages?.length || 0} lessons</div>
          </div>
        </div>
      )}
      {!isTrained && trainStatus === "idle" && totalSelected === 0 && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ fontSize: 13, color: "#92400e" }}>No training data yet. Select lessons below and click <strong>Save & Train</strong>.</div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#9ca3af" }}>Loading courses...</div>
      ) : courses.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "60px", color: "#9ca3af" }}>No courses found. Create courses first in Course Management.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {courses.map(course => {
            const isExpanded = expanded.has(course.id);
            const isCourseChecked = selectedCourses.has(course.id);
            const coursePageCount = (course.pages || []).length;
            const selectedInCourse = (course.pages || []).filter(p => selectedPages.has(p.id)).length;
            const hasNoPages = coursePageCount === 0;

            return (
              <div key={course.id} style={{ ...card, padding: 0, overflow: "hidden", opacity: hasNoPages ? 0.6 : 1 }}>
                {/* Course header */}
                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 20px", background: "#f8fafc", borderBottom: isExpanded ? "1px solid #e5e7eb" : "none" }}>
                  <input type="checkbox" checked={isCourseChecked} onChange={() => !hasNoPages && toggleCourse(course.id, course)}
                    disabled={hasNoPages}
                    style={{ width: 16, height: 16, accentColor: "#3b82f6", cursor: hasNoPages ? "not-allowed" : "pointer", flexShrink: 0 }} />
                  <button onClick={() => !hasNoPages && setExpanded(prev => { const n = new Set(prev); n.has(course.id) ? n.delete(course.id) : n.add(course.id); return n; })}
                    disabled={hasNoPages}
                    style={{ background: "none", border: "none", cursor: hasNoPages ? "default" : "pointer", flex: 1, textAlign: "left", display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "18px" }}>📚</span>
                    <span style={{ fontWeight: 700, fontSize: "15px", color: "#1f2937" }}>{course.title}</span>
                    {hasNoPages
                      ? <span style={{ fontSize: "11px", color: "#f59e0b", marginLeft: "auto", background: "#fef3c7", padding: "2px 8px", borderRadius: 6 }}>No lessons</span>
                      : <span style={{ fontSize: "12px", color: selectedInCourse > 0 ? "#3b82f6" : "#9ca3af", marginLeft: "auto", fontWeight: selectedInCourse > 0 ? 600 : 400 }}>{selectedInCourse}/{coursePageCount} lessons</span>
                    }
                    {!hasNoPages && <span style={{ color: "#9ca3af", fontSize: "12px" }}>{isExpanded ? "▲" : "▼"}</span>}
                  </button>
                </div>

                {/* Folders + Pages */}
                {isExpanded && (
                  <div style={{ padding: "8px 0" }}>
                    {(course.pages || []).filter(p => !p.folderId).map(page => (
                      <label key={page.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 20px 8px 44px", cursor: "pointer" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <input type="checkbox" checked={selectedPages.has(page.id)} onChange={() => togglePage(page.id)}
                          style={{ width: 14, height: 14, accentColor: "#3b82f6", cursor: "pointer" }} />
                        <span style={{ fontSize: "14px" }}>📄</span>
                        <span style={{ fontSize: "13px", color: "#374151" }}>{page.title}</span>
                        {page.transcript && <span style={{ fontSize: "11px", color: "#10b981", marginLeft: "auto" }}>✓ transcript</span>}
                      </label>
                    ))}
                    {(course.folders || []).map(folder => {
                      const folderPages = (course.pages || []).filter(p => p.folderId === folder.id);
                      const isFolderChecked = selectedFolders.has(folder.id);
                      return (
                        <div key={folder.id}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 20px 8px 28px" }}>
                            <input type="checkbox" checked={isFolderChecked} onChange={() => toggleFolder(folder.id, course)}
                              style={{ width: 15, height: 15, accentColor: "#3b82f6", cursor: "pointer" }} />
                            <span style={{ fontSize: "15px" }}>📁</span>
                            <span style={{ fontWeight: 600, fontSize: "13px", color: "#374151" }}>{folder.title}</span>
                            <span style={{ fontSize: "11px", color: "#9ca3af" }}>({folderPages.filter(p => selectedPages.has(p.id)).length}/{folderPages.length})</span>
                          </div>
                          {folderPages.map(page => (
                            <label key={page.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "7px 20px 7px 60px", cursor: "pointer" }}
                              onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                              <input type="checkbox" checked={selectedPages.has(page.id)} onChange={() => togglePage(page.id)}
                                style={{ width: 14, height: 14, accentColor: "#3b82f6", cursor: "pointer" }} />
                              <span style={{ fontSize: "13px" }}>📄</span>
                              <span style={{ fontSize: "13px", color: "#374151" }}>{page.title}</span>
                              {page.transcript && <span style={{ fontSize: "11px", color: "#10b981", marginLeft: "auto" }}>✓ transcript</span>}
                            </label>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tune Panel ───────────────────────────────────────────────────────────────

function TunePanel({ bot, onSave, saving }: { bot: CourseBot; onSave: (u: Partial<CourseBot>) => void; saving: boolean }) {
  const [model, setModel] = useState(bot.model || "gpt-4o-mini");
  const [creativity, setCreativity] = useState(bot.creativity || 0);
  const [systemPrompt, setSystemPrompt] = useState(bot.systemPrompt || "");
  const { saved, flash } = useSaved();

  return (
    <div style={{ padding: "32px" }}>
      <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "24px" }}>Tune AI</h2>

      <div style={{ ...card, marginBottom: "20px" }}>
        <div style={{ fontWeight: 600, marginBottom: "12px" }}>Model</div>
        <select value={model} onChange={e => setModel(e.target.value)} style={inputStyle}>
          <option value="gpt-4o-mini">GPT-4o mini</option>
          <option value="gpt-4o">GPT-4o</option>
          <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
        </select>
      </div>

      <div style={{ ...card, marginBottom: "20px" }}>
        <div style={{ fontWeight: 600, marginBottom: "4px" }}>AI Creativity</div>
        <p style={{ color: "#6b7280", fontSize: "13px", marginBottom: "12px" }}>Lower = more focused, Higher = more creative</p>
        <input type="range" min={0} max={100} value={creativity} onChange={e => setCreativity(Number(e.target.value))} style={{ width: "100%", accentColor: "#1f2937" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
          <span>0%</span><span style={{ fontWeight: 600, color: "#1f2937" }}>{creativity}%</span><span>100%</span>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: "4px" }}>AI Instruction Prompt</div>
        <p style={{ color: "#6b7280", fontSize: "13px", marginBottom: "12px" }}>Define how the bot should behave with course content</p>
        <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
          placeholder="e.g. You are a helpful course assistant. Only answer questions related to the course content provided."
          style={{ ...inputStyle, minHeight: "160px", resize: "vertical" } as any} />
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "10px" }}>
          <SavedBadge visible={saved} />
          <button onClick={() => { onSave({ model, creativity, systemPrompt }); flash(); }} disabled={saving} style={btnPrimary}>{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Appearance Panel ─────────────────────────────────────────────────────────

const COLOR_THEMES = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#1f2937", "#0ea5e9"];

function AppearancePanel({ bot, onSave, saving }: { bot: CourseBot; onSave: (u: Partial<CourseBot>) => void; saving: boolean }) {
  const [botTitle, setBotTitle] = useState(bot.botTitle || bot.name || "");
  const [welcomeMessage, setWelcomeMessage] = useState(bot.welcomeMessage || "Hi! Ask me anything about this course.");
  const [placeholder, setPlaceholder] = useState(bot.placeholder || "Ask about the course...");
  const [colorTheme, setColorTheme] = useState(bot.colorTheme || "#3b82f6");
  const { saved, flash } = useSaved();

  return (
    <div style={{ padding: "32px" }}>
      <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "24px" }}>Appearance</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: "#e5e7eb", borderRadius: "12px", overflow: "hidden", border: "1px solid #e5e7eb", marginBottom: "20px" }}>
        <div style={{ background: "#fff", padding: "18px 20px" }}>
          <div style={{ fontWeight: 600, marginBottom: "8px" }}>Bot Title</div>
          <input value={botTitle} onChange={e => setBotTitle(e.target.value)} style={inputStyle} placeholder="Course AI Assistant" />
        </div>
        <div style={{ background: "#fff", padding: "18px 20px" }}>
          <div style={{ fontWeight: 600, marginBottom: "8px" }}>Welcome Message</div>
          <input value={welcomeMessage} onChange={e => setWelcomeMessage(e.target.value)} style={inputStyle} placeholder="Hi! Ask me anything about this course." />
        </div>
        <div style={{ background: "#fff", padding: "18px 20px" }}>
          <div style={{ fontWeight: 600, marginBottom: "8px" }}>Input Placeholder</div>
          <input value={placeholder} onChange={e => setPlaceholder(e.target.value)} style={inputStyle} placeholder="Ask about the course..." />
        </div>
        <div style={{ background: "#fff", padding: "18px 20px" }}>
          <div style={{ fontWeight: 600, marginBottom: "12px" }}>Color Theme</div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {COLOR_THEMES.map(c => (
              <button key={c} onClick={() => setColorTheme(c)} style={{ width: 36, height: 36, borderRadius: "50%", background: c, border: "none", cursor: "pointer", boxShadow: colorTheme === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : "none" }} />
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "10px" }}>
        <SavedBadge visible={saved} />
        <button onClick={() => { onSave({ botTitle, welcomeMessage, placeholder, colorTheme }); flash(); }} disabled={saving} style={btnPrimary}>{saving ? "Saving..." : "Save Changes"}</button>
      </div>
    </div>
  );
}

// ─── Overview Panel ───────────────────────────────────────────────────────────

function CourseOverviewPanel({ bot }: { bot: CourseBot }) {
  const [realChars, setRealChars] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/course-ai-bots/${bot.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.totalChars != null) setRealChars(data.totalChars); })
      .catch(() => {});
  }, [bot.id]);

  const totalChars = realChars ?? (bot.selectedPages?.length || 0) * 500;
  const maxChars = 1_000_000;

  const statCards = [
    {
      icon: "⏱",
      label: "Today's Users and time",
      values: [
        { num: 0, sub: "Users" },
        { num: bot.totalMessages || 0, sub: "Messages" },
      ],
    },
    {
      icon: "💬",
      label: "Message",
      values: [{ num: `${bot.totalMessages || 0} / 50`, sub: "Has sent" }],
      corner: "💬",
    },
    {
      icon: "📝",
      label: "Training",
      values: [{ num: `${totalChars.toLocaleString()} / 1M`, sub: realChars != null ? "Characters used" : "Characters (est.)" }],
      corner: "✏️",
    },
  ];

  return (
    <div style={{ padding: "32px" }}>
      <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "24px", color: "#1f2937" }}>Overview</h2>

      {/* 3 stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "20px" }}>
        {statCards.map((c, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: "14px", padding: "22px 24px", border: "1px solid #e5e7eb", position: "relative", minHeight: "120px" }}>
            {c.corner && <div style={{ position: "absolute", top: "16px", right: "16px", fontSize: "18px", color: "#d1d5db" }}>{c.corner}</div>}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px" }}>{c.icon}</div>
              <span style={{ fontSize: "13px", color: "#9ca3af" }}>{c.label}</span>
            </div>
            <div style={{ display: "flex", gap: "32px" }}>
              {c.values.map((v, vi) => (
                <div key={vi}>
                  <div style={{ fontSize: "28px", fontWeight: 700, color: "#1f2937", lineHeight: 1 }}>{v.num}</div>
                  <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px" }}>{v.sub}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* World map card */}
      <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e5e7eb", padding: "22px 24px", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px" }}>🌐</div>
          <div>
            <div style={{ fontSize: "13px", color: "#9ca3af" }}>Popular Countries</div>
            <div style={{ fontSize: "11px", color: "#d1d5db" }}>Last 28 days</div>
          </div>
        </div>
        <div style={{ width: "100%", height: "380px", borderRadius: "8px", overflow: "hidden", background: "#f8fafc" }}>
          <WorldMap />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}>
          <span style={{ fontSize: "10px", color: "#9ca3af" }}>0</span>
          <div style={{ flex: 1, height: "5px", borderRadius: "3px", background: "linear-gradient(to right, #e0f2fe, #38bdf8, #818cf8, #f472b6, #fb923c, #4ade80)" }} />
          <span style={{ fontSize: "10px", color: "#9ca3af" }}>∞</span>
        </div>
      </div>
    </div>
  );
}

// ─── Chat History Panel ───────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  admin:   { bg: "#e5e7eb", color: "#1f2937" },
  sales:   { bg: "#dbeafe", color: "#1d4ed8" },
  manager: { bg: "#ede9fe", color: "#6d28d9" },
  marketing: { bg: "#fce7f3", color: "#be185d" },
};

function RoleBadge({ role }: { role: string }) {
  const r = role?.toLowerCase() || "";
  const style = ROLE_COLORS[r] || { bg: "#f3f4f6", color: "#374151" };
  return (
    <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: style.bg, color: style.color, textTransform: "capitalize" }}>
      {role || "—"}
    </span>
  );
}

function fmtStarted(d: string) {
  const dt = new Date(d);
  const month = dt.toLocaleString("default", { month: "short" });
  const day = dt.getDate();
  const time = dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return { date: `${month} ${day}`, time };
}

function CourseChatHistoryPanel({ bot }: { bot: CourseBot }) {
  const [chats, setChats] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    fetch(`/api/course-ai-bots/chats?botId=${bot.id}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { setChats(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [bot.id]);

  const filtered = chats.filter(c =>
    !search ||
    c.userName?.toLowerCase().includes(search.toLowerCase()) ||
    c.userEmail?.toLowerCase().includes(search.toLowerCase()) ||
    c.title?.toLowerCase().includes(search.toLowerCase())
  );

  function toggleAll() {
    if (checked.size === filtered.length) setChecked(new Set());
    else setChecked(new Set(filtered.map((c: any) => c.chatId)));
  }

  function toggleOne(id: string) {
    setChecked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function lastMsg(chat: any) {
    const msgs = chat.messages || [];
    const last = msgs[msgs.length - 1];
    if (!last) return "—";
    const txt = last.content || "";
    return txt.length > 45 ? txt.slice(0, 45) + "..." : txt;
  }

  // ── View single chat ──
  if (selected) return (
    <div style={{ padding: 32 }}>
      <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: 14, marginBottom: 20, display: "flex", alignItems: "center", gap: 6 }}>← Back to Chat History</button>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{selected.title || "Untitled"}</div>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
            {selected.userName} {selected.userEmail ? `· ${selected.userEmail}` : ""}
          </div>
        </div>
        <RoleBadge role={selected.userRole} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 700 }}>
        {(selected.messages || []).map((m: any, i: number) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "75%", padding: "10px 14px", borderRadius: 16, fontSize: 14, lineHeight: 1.6, background: m.role === "user" ? "#1f2937" : "#f3f4f6", color: m.role === "user" ? "#fff" : "#1f2937", whiteSpace: "pre-wrap" }}>
              {m.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── Table view ──
  const thStyle: React.CSSProperties = { padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.05em", textTransform: "uppercase", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" };
  const tdStyle: React.CSSProperties = { padding: "14px 16px", fontSize: 13, color: "#374151", borderBottom: "1px solid #f3f4f6", verticalAlign: "middle" };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Chat History</h2>
          <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>All user conversations with this course bot</p>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search user or title..." style={{ ...inputStyle, maxWidth: 240, marginBottom: 0 }} />
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#9ca3af" }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: 60, color: "#9ca3af" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
          <div style={{ fontSize: 15, fontWeight: 500, color: "#374151" }}>No conversations yet</div>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ background: "#f9fafb" }}>
              <tr>
                <th style={{ ...thStyle, width: 40 }}>
                  <input type="checkbox" checked={checked.size === filtered.length && filtered.length > 0} onChange={toggleAll} style={{ cursor: "pointer" }} />
                </th>
                <th style={thStyle}>Started</th>
                <th style={thStyle}>Last Message</th>
                <th style={thStyle}>User</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Language</th>
                <th style={thStyle}>Model</th>
                <th style={thStyle}>Messages</th>
                <th style={thStyle}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(chat => {
                const { date, time } = fmtStarted(chat.createdAt || chat.updatedAt);
                return (
                  <tr key={chat.chatId}
                    onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                    onMouseLeave={e => (e.currentTarget.style.background = "#fff")}>
                    <td style={tdStyle}>
                      <input type="checkbox" checked={checked.has(chat.chatId)} onChange={() => toggleOne(chat.chatId)} style={{ cursor: "pointer" }} />
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500 }}>{date}</div>
                      <div style={{ fontSize: 12, color: "#9ca3af" }}>{time}</div>
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 260, color: "#6b7280" }}>{lastMsg(chat)}</td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600 }}>{chat.userName || "—"}</div>
                      {chat.userEmail && <div style={{ fontSize: 12, color: "#9ca3af" }}>{chat.userEmail}</div>}
                    </td>
                    <td style={tdStyle}><RoleBadge role={chat.userRole} /></td>
                    <td style={{ ...tdStyle, color: "#6b7280" }}>English</td>
                    <td style={tdStyle}>
                      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span>🤖</span>
                        <span style={{ fontSize: 12 }}>{bot.model || "gpt-4o-mini"}</span>
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>{chat.messages?.length || 0}</td>
                    <td style={tdStyle}>
                      <button onClick={() => setSelected(chat)}
                        style={{ padding: "5px 14px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 500 }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f3f4f6")}
                        onMouseLeave={e => (e.currentTarget.style.background = "#fff")}>
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: "10px 16px", fontSize: 12, color: "#9ca3af", borderTop: "1px solid #f3f4f6" }}>
            {filtered.length} conversation{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Live Chat Panel ──────────────────────────────────────────────────────────

function CourseLiveChatPanel({ bot }: { bot: CourseBot }) {
  type Msg = { role: "user" | "assistant"; content: string; timestamp: string };
  const [sessions, setSessions] = useState<any[]>([]);
  const [currentChatId, setCurrentChatId] = useState(() => `course-live-${bot.id}-${Date.now()}`);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const theme = bot.colorTheme || "#3b82f6";

  useEffect(() => { loadSessions(); }, [bot.id]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function loadSessions() {
    const res = await fetch(`/api/course-ai-bots/chats?botId=${bot.id}`);
    if (res.ok) setSessions(await res.json());
  }

  function startNewChat() {
    setMessages([]); setInput("");
    setCurrentChatId(`course-live-${bot.id}-${Date.now()}`);
  }

  function loadSession(s: any) {
    setMessages(s.messages || []);
    setCurrentChatId(s.chatId);
    setSidebarCollapsed(true);
  }

  async function deleteSession(chatId: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch("/api/course-ai-bots/chats", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId }) });
    setSessions(prev => prev.filter(s => s.chatId !== chatId));
    if (currentChatId === chatId) startNewChat();
  }

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg: Msg = { role: "user", content: input.trim(), timestamp: new Date().toISOString() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages); setInput(""); setLoading(true);
    try {
      const res = await fetch("/api/course-ai-bots/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId: bot.id, messages: newMessages, chatId: currentChatId, userId: "admin", userName: "Admin", userRole: "admin" })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.message || "Error", timestamp: new Date().toISOString() }]);
      loadSessions();
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Failed to get response.", timestamp: new Date().toISOString() }]);
    } finally { setLoading(false); }
  }

  const adminSessions = sessions.filter(s => s.userId === "admin");

  return (
    <div style={{ padding: 32, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Live Chat</h2>
        <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>Chat with the course bot — conversations are saved to Chat History</p>
      </div>
      <div style={{ flex: 1, display: "flex", background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden", minHeight: 500 }}>

        {/* Sidebar */}
        <div style={{ width: sidebarCollapsed ? 0 : 220, minWidth: sidebarCollapsed ? 0 : 220, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", overflow: "hidden", transition: "width 0.2s, min-width 0.2s", flexShrink: 0 }}>
          <div style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
            <button onClick={startNewChat} style={{ width: "100%", padding: "8px 12px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>✏️ New Chat</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
            {adminSessions.length === 0
              ? <div style={{ padding: "16px 12px", color: "#9ca3af", fontSize: 12, textAlign: "center" }}>No chats yet</div>
              : adminSessions.map(s => (
                <div key={s.chatId} onClick={() => loadSession(s)}
                  style={{ padding: "9px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 2, background: currentChatId === s.chatId ? "#f3f4f6" : "transparent", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>💬 {s.title || "Untitled"}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{new Date(s.updatedAt).toLocaleDateString()}</div>
                  </div>
                  <button onClick={e => deleteSession(s.chatId, e)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 13, padding: "2px 4px", flexShrink: 0 }}>🗑</button>
                </div>
              ))
            }
          </div>
        </div>

        {/* Main chat */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "0 16px", background: theme, display: "flex", alignItems: "center", gap: 10, minHeight: 52, flexShrink: 0 }}>
            <button onClick={() => setSidebarCollapsed(p => !p)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "rgba(255,255,255,0.8)", padding: 4 }}>☰</button>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🎓</div>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 14, flex: 1 }}>{bot.botTitle || bot.name}</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.15)", padding: "3px 10px", borderRadius: 12 }}>Admin</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            {messages.length === 0 && (
              <div style={{ textAlign: "center", color: "#9ca3af", marginTop: 40 }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🎓</div>
                <div style={{ fontSize: 15 }}>{bot.welcomeMessage || "Hi! Ask me anything about this course."}</div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "75%", padding: "10px 14px", borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px", background: m.role === "user" ? "#1f2937" : "#f3f4f6", color: m.role === "user" ? "#fff" : "#1f2937", fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{m.content}</div>
              </div>
            ))}
            {loading && <div style={{ display: "flex" }}><div style={{ padding: "10px 14px", borderRadius: "18px 18px 18px 4px", background: "#f3f4f6", color: "#9ca3af", fontSize: 14 }}>Thinking...</div></div>}
            <div ref={bottomRef} />
          </div>
          <div style={{ padding: "12px 16px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 8 }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
              placeholder={bot.placeholder || "Ask about the course..."}
              style={{ ...inputStyle, flex: 1, marginBottom: 0 }} />
            <button onClick={send} disabled={loading || !input.trim()}
              style={{ ...btnPrimary, opacity: loading || !input.trim() ? 0.5 : 1, padding: "9px 18px" }}>Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Test Panel ───────────────────────────────────────────────────────────────

function CourseTestPanel({ bot }: { bot: CourseBot }) {
  type Msg = { role: "user" | "assistant"; content: string };
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: bot.welcomeMessage || "Hi! Ask me anything about this course." }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const color = bot.colorTheme || "#3b82f6";

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg: Msg = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages); setInput(""); setLoading(true);
    try {
      const res = await fetch("/api/course-ai-bots/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId: bot.id, messages: newMessages })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.message || data.error || "Error" }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Failed to get response." }]);
    } finally { setLoading(false); }
  }

  return (
    <div style={{ padding: 32, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Test Your Bot</h2>
          <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>Test how your course bot responds</p>
        </div>
        <button onClick={() => setMessages([{ role: "assistant", content: bot.welcomeMessage || "Hi! Ask me anything about this course." }])} style={btnSecondary}>Clear</button>
      </div>
      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 520, borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.10)", border: "1px solid #e5e7eb", background: "#fff", display: "flex", flexDirection: "column", height: "calc(100vh - 220px)", minHeight: 500 }}>
          <div style={{ background: color, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🎓</div>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 15, flex: 1 }}>{bot.botTitle || bot.name}</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 12, background: "#f8fafc" }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 8 }}>
                {m.role === "assistant" && <div style={{ width: 28, height: 28, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>🎓</div>}
                <div style={{ padding: "10px 14px", borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", fontSize: 14, lineHeight: 1.6, background: m.role === "user" ? color : "#fff", color: m.role === "user" ? "#fff" : "#1f2937", boxShadow: "0 1px 4px rgba(0,0,0,0.07)", maxWidth: "72%" }}>{m.content}</div>
              </div>
            ))}
            {loading && <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}><div style={{ width: 28, height: 28, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🎓</div><div style={{ padding: "10px 14px", borderRadius: "16px 16px 16px 4px", background: "#fff", color: "#6b7280", fontSize: 14 }}>Thinking...</div></div>}
            <div ref={bottomRef} />
          </div>
          <div style={{ padding: "12px 16px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 8, background: "#fff" }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
              placeholder={bot.placeholder || "Ask about the course..."}
              style={{ ...inputStyle, flex: 1, marginBottom: 0, borderRadius: 20, padding: "10px 16px" }} />
            <button onClick={send} disabled={loading || !input.trim()}
              style={{ width: 40, height: 40, borderRadius: "50%", background: color, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: loading || !input.trim() ? 0.5 : 1, flexShrink: 0 }}>
              <span style={{ color: "#fff", fontSize: 16 }}>➤</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Settings Panel ───────────────────────────────────────────────────────────

function CourseSettingsPanel({ bot, onSave, saving, onDelete }: { bot: CourseBot; onSave: (u: Partial<CourseBot>) => void; saving: boolean; onDelete: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [allUsers, setAllUsers] = useState<{ id: string; name: string; email: string; role: string }[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [teamMembers, setTeamMembers] = useState<string[]>(bot.teamMembers || []);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/users").then(r => r.ok ? r.json() : []).then(data => setAllUsers(data.filter((u: any) => u.role !== "admin")));
  }, []);

  useEffect(() => {
    function h(e: MouseEvent) { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filteredUsers = allUsers.filter(u => !teamMembers.includes(u.id) && (u.name?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase())));

  function addMember(user: any) {
    const updated = [...teamMembers, user.id];
    setTeamMembers(updated); setUserSearch(""); setShowDropdown(false);
    onSave({ teamMembers: updated });
  }

  function removeMember(id: string) {
    const updated = teamMembers.filter(m => m !== id);
    setTeamMembers(updated);
    onSave({ teamMembers: updated });
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    await fetch(`/api/course-ai-bots/${bot.id}`, { method: "DELETE" });
    onDelete();
  }

  return (
    <div style={{ padding: 32 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Settings</h2>
      <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 28 }}>Manage team members and delete this bot.</p>

      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>👥 Team Members</div>
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>Add users who can access this course bot.</p>
        <div style={{ position: "relative", marginBottom: 16 }} ref={dropdownRef}>
          <input value={userSearch} onChange={e => { setUserSearch(e.target.value); setShowDropdown(true); }} onFocus={() => setShowDropdown(true)}
            placeholder="Search users..." style={{ ...inputStyle, marginBottom: 0 }} />
          {showDropdown && filteredUsers.length > 0 && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 100, maxHeight: 200, overflowY: "auto" }}>
              {filteredUsers.map(u => (
                <div key={u.id} onClick={() => addMember(u)} style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #f3f4f6" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#fff")}>
                  <span style={{ fontWeight: 600 }}>{u.name || u.email}</span> <span style={{ color: "#9ca3af" }}>· {u.role}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {teamMembers.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px", color: "#9ca3af", background: "#f9fafb", borderRadius: 8, fontSize: 13 }}>No team members added yet</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {teamMembers.map(id => {
              const u = allUsers.find(u => u.id === id);
              return (
                <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{u?.name || u?.email || id}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>{u?.email} · {u?.role}</div>
                  </div>
                  <button onClick={() => removeMember(id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 14 }}>🗑</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ ...card, border: "1px solid #fecaca" }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#dc2626", marginBottom: 8 }}>🗑️ Delete Bot</div>
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>This is permanent and cannot be undone.</p>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 16, fontSize: 13 }}>
          <input type="checkbox" checked={confirmDelete} onChange={e => setConfirmDelete(e.target.checked)} style={{ accentColor: "#dc2626" }} />
          Yes, I want to permanently delete this bot.
        </label>
        <button onClick={handleDelete} disabled={!confirmDelete || deleting}
          style={{ ...btnPrimary, background: confirmDelete ? "#dc2626" : "#e5e7eb", color: confirmDelete ? "#fff" : "#9ca3af", cursor: confirmDelete ? "pointer" : "not-allowed" }}>
          {deleting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </div>
  );
}
