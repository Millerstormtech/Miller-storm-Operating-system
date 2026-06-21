import { useState } from "react";
import { Course } from "../../types";

type BotConfig = {
  id: string;
  name: string;
  description: string;
  awareOfStrengths: boolean;
  assignedTo?: string;
  assignedType?: "course" | "lesson" | "global";
};

const initialBots: BotConfig[] = [
  { id: "ceo-bot", name: "CEO Bot (Jay Clone)", description: "Exec-level narratives, culture, and strategic context for the field.", awareOfStrengths: true, assignedType: "global" },
  { id: "sales-coach", name: "Sales Coach Bot", description: "Deal coaching, objection handling, and field scenarios.", awareOfStrengths: true, assignedType: "global" },
  { id: "marketing-assistant", name: "Marketing Assistant Bot", description: "Campaign planning, copy suggestions, and asset recommendations.", awareOfStrengths: false, assignedType: "global" }
];

export function AiBotManagement(props: { courses: Course[] }) {
  const [bots, setBots] = useState<BotConfig[]>(initialBots);
  const [isCreating, setIsCreating] = useState(false);
  const [newBotName, setNewBotName] = useState("");
  const [newBotDescription, setNewBotDescription] = useState("");

  function createBot() {
    if (!newBotName.trim()) return;
    const newBot: BotConfig = { id: `bot-${Date.now()}`, name: newBotName, description: newBotDescription, awareOfStrengths: false, assignedType: "global" };
    setBots([...bots, newBot]);
    setIsCreating(false);
    setNewBotName("");
    setNewBotDescription("");
  }

  const allLessons: { courseId: string; courseTitle: string; pageId: string; pageTitle: string }[] = [];
  props.courses.forEach((course) => {
    (course.pages || []).forEach((page) => {
      allLessons.push({
        courseId: course.id,
        courseTitle: course.title,
        pageId: page.id,
        pageTitle: page.title
      });
    });
  });

  return (
    <div className="ai-bot-management">
      <div className="panel-header">
        <div className="panel-header-row">
          <span>AI Bot Management</span>
          <button type="button" className="btn-primary btn-success btn-small" onClick={() => setIsCreating(true)}>+ Create Bot</button>
        </div>
      </div>
      {isCreating && (
        <div className="panel-body" style={{ borderBottom: "1px solid #e5e7eb", marginBottom: 16 }}>
          <div className="form-grid">
            <label className="field">
              <span className="field-label">Bot Name</span>
              <input className="field-input" value={newBotName} onChange={(e) => setNewBotName(e.target.value)} placeholder="Enter bot name" />
            </label>
            <label className="field">
              <span className="field-label">Description</span>
              <input className="field-input" value={newBotDescription} onChange={(e) => setNewBotDescription(e.target.value)} placeholder="Enter description" />
            </label>
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button type="button" className="btn-primary btn-success" onClick={createBot}>Create</button>
            <button type="button" className="btn-secondary" onClick={() => { setIsCreating(false); setNewBotName(""); setNewBotDescription(""); }}>Cancel</button>
          </div>
        </div>
      )}
      <div className="panel-body list">
        {bots.map((bot) => (
          <div key={bot.id} className="card card-row">
            <div className="card-main">
              <div className="card-title">{bot.name}</div>
              <div className="card-description">{bot.description}</div>
              <div className="field" style={{ marginTop: 12 }}>
                <span className="field-label">Assign To</span>
                <select
                  className="field-input"
                  value={bot.assignedTo || ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    const [type, id] = value.split(":");
                    setBots(
                      bots.map((b) =>
                        b.id === bot.id
                          ? { ...b, assignedTo: id || undefined, assignedType: (type as "course" | "lesson" | "global") || "global" }
                          : b
                      )
                    );
                  }}
                >
                  <option value="global:">Global (All Users)</option>
                  {props.courses.map((course) => (
                    <option key={course.id} value={`course:${course.id}`}>Course: {course.title}</option>
                  ))}
                  {allLessons.map((lesson) => (
                    <option key={lesson.pageId} value={`lesson:${lesson.pageId}`}>Lesson: {lesson.courseTitle} - {lesson.pageTitle}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <span className="field-label">
                  Knowledge Base Upload
                  <span style={{ marginLeft: 8, cursor: "pointer", color: "#6b7280", fontSize: 12 }} title="Supported formats: PDF, DOCX, TXT, MD, CSV (Max 10MB per file)">ⓘ Info</span>
                </span>
                <div className="field-inline">
                  <button className="btn-secondary">Upload Files</button>
                  <button className="btn-secondary">Manage Sources</button>
                </div>
              </div>
            </div>
            <div className="card-side">
              <label className="toggle-item">
                <input type="checkbox" checked={bot.awareOfStrengths} onChange={(e) => setBots(bots.map((b) => b.id === bot.id ? { ...b, awareOfStrengths: e.target.checked } : b))} />
                <span className="toggle-label">Aware of user strengths/weaknesses</span>
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
