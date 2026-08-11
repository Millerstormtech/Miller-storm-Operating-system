import { useState } from "react";

export type Task = {
  id: string;
  assignedOn: string;
  description: string;
  deadline: string;
  priority: "low" | "medium" | "high";
  status: "not started" | "in progress" | "blocked" | "on hold" | "done";
  notesByManager?: string;
  documentLinkByManager?: string;
  notesByUser?: string;
  supportingLinksByUser?: string;
  meetingLink?: string;
  assignedTo: string;
  createdBy?: string;
  origin?: "assigned" | "self";
  visibility?: "private" | "shared";
  completedAt?: string | null;
  editableFields?: string[];
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "#c0392b",
  medium: "#d68910",
  low: "#7f8c8d"
};

const STATUSES: Task["status"][] = [
  "not started",
  "in progress",
  "blocked",
  "on hold",
  "done"
];

type TaskCardProps = {
  task: Task;
  assignerName?: string;
  onChange: (id: string, changes: Partial<Task>) => void;
  readOnly?: boolean;
};

export function TaskCard({ task, assignerName, onChange, readOnly }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(task.notesByUser ?? "");
  const [links, setLinks] = useState(task.supportingLinksByUser ?? "");

  const isSelf = task.origin === "self";
  const byLine = isSelf
    ? "Added by you"
    : assignerName
      ? `Assigned by ${assignerName}`
      : "Assigned by a manager";

  return (
    <div
      style={{
        border: "1px solid #e1e4e8",
        borderLeft: `4px solid ${PRIORITY_COLORS[task.priority] ?? "#7f8c8d"}`,
        borderRadius: 8,
        padding: 14,
        marginBottom: 10,
        background: "var(--surface-default)"
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <input
          type="checkbox"
          checked={task.status === "done"}
          disabled={readOnly}
          onChange={(e) =>
            onChange(task.id, { status: e.target.checked ? "done" : "in progress" })
          }
          style={{ marginTop: 4, width: 18, height: 18, cursor: readOnly ? "default" : "pointer" }}
          aria-label={`Mark "${task.description}" complete`}
        />
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontWeight: 600,
              textDecoration: task.status === "done" ? "line-through" : "none",
              color: task.status === "done" ? "#7f8c8d" : "#111"
            }}
          >
            {task.description}
          </div>
          <div style={{ fontSize: 12, color: "#7f8c8d", marginTop: 4 }}>
            Due {task.deadline} · {task.priority} priority · {byLine}
            {isSelf && task.visibility === "private" ? " · private" : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#2c6fbb" }}
        >
          {expanded ? "Hide" : "Details"}
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, paddingLeft: 30, fontSize: 14 }}>
          {!readOnly && (
            <label style={{ display: "block", marginBottom: 10 }}>
              Status
              <select
                value={task.status}
                onChange={(e) => onChange(task.id, { status: e.target.value as Task["status"] })}
                style={{ display: "block", marginTop: 4, padding: 6 }}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}

          {task.notesByManager ? (
            <p style={{ margin: "8px 0" }}>
              <strong>Notes from your manager:</strong> {task.notesByManager}
            </p>
          ) : null}

          {task.documentLinkByManager ? (
            <p style={{ margin: "8px 0" }}>
              <a href={task.documentLinkByManager} target="_blank" rel="noopener noreferrer">
                Open the attached document
              </a>
            </p>
          ) : null}

          {task.meetingLink ? (
            <p style={{ margin: "8px 0" }}>
              <a href={task.meetingLink} target="_blank" rel="noopener noreferrer">
                Join the meeting
              </a>
            </p>
          ) : null}

          {!readOnly && (
            <>
              <label style={{ display: "block", marginTop: 10 }}>
                Your notes
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => {
                    if (notes !== (task.notesByUser ?? "")) {
                      onChange(task.id, { notesByUser: notes });
                    }
                  }}
                  rows={3}
                  style={{ display: "block", width: "100%", marginTop: 4, padding: 6 }}
                />
              </label>

              <label style={{ display: "block", marginTop: 10 }}>
                Your links
                <input
                  type="text"
                  value={links}
                  onChange={(e) => setLinks(e.target.value)}
                  onBlur={() => {
                    if (links !== (task.supportingLinksByUser ?? "")) {
                      onChange(task.id, { supportingLinksByUser: links });
                    }
                  }}
                  style={{ display: "block", width: "100%", marginTop: 4, padding: 6 }}
                />
              </label>
            </>
          )}
        </div>
      )}
    </div>
  );
}
