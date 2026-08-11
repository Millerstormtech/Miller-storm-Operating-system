import { useState } from "react";

export type NewTaskInput = {
  description: string;
  deadline: string;
  priority: "low" | "medium" | "high";
  visibility: "private" | "shared";
};

type AddTaskModalProps = {
  onClose: () => void;
  onCreate: (input: NewTaskInput) => Promise<void>;
};

export function AddTaskModal({ onClose, onCreate }: AddTaskModalProps) {
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState<NewTaskInput["priority"]>("medium");
  const [shared, setShared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!description.trim()) {
      setError("Please describe the task.");
      return;
    }
    if (!deadline) {
      setError("Please pick a deadline.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await onCreate({
        description: description.trim(),
        deadline,
        priority,
        visibility: shared ? "shared" : "private"
      });
      onClose();
    } catch {
      setError("Could not save the task. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--surface-default)", borderRadius: 10, padding: 20, width: 460, maxWidth: "92vw" }}
      >
        <h3 style={{ marginTop: 0 }}>Add a task</h3>

        <label style={{ display: "block", marginBottom: 12 }}>
          What needs doing
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{ display: "block", width: "100%", marginTop: 4, padding: 8 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          Deadline
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            style={{ display: "block", marginTop: 4, padding: 8 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          Priority
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as NewTaskInput["priority"])}
            style={{ display: "block", marginTop: 4, padding: 8 }}
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={shared}
            onChange={(e) => setShared(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            Share this with my leader
            <br />
            <span style={{ fontSize: 12, color: "#7f8c8d" }}>
              Off by default: tasks you add for yourself stay private unless you share them.
            </span>
          </span>
        </label>

        {error ? <p style={{ color: "#c0392b", fontSize: 13 }}>{error}</p> : null}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
          <button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={saving}>
            {saving ? "Saving..." : "Add task"}
          </button>
        </div>
      </div>
    </div>
  );
}
