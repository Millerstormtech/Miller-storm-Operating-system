import { useEffect, useState } from "react";

type Assignee = { id: string; name: string; email: string };

type AssignTaskModalProps = {
  onClose: () => void;
  onAssigned: () => void;
};

export function AssignTaskModal({ onClose, onAssigned }: AssignTaskModalProps) {
  const [people, setPeople] = useState<Assignee[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState("medium");
  const [notes, setNotes] = useState("");
  const [documentLink, setDocumentLink] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/tasks/assignable-users")
      .then((r) => (r.ok ? r.json() : []))
      .then(setPeople)
      .catch(() => setPeople([]));
  }, []);

  function togglePerson(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  async function submit() {
    if (selected.length === 0) {
      setError("Pick at least one person.");
      return;
    }
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
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedTo: selected,
          description: description.trim(),
          deadline,
          priority,
          notesByManager: notes,
          documentLinkByManager: documentLink,
          meetingLink
        })
      });
      if (!res.ok) throw new Error("assign failed");
      onAssigned();
      onClose();
    } catch {
      setError("Could not assign the task. Please try again.");
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
        style={{
          background: "#fff",
          borderRadius: 10,
          padding: 20,
          width: 520,
          maxWidth: "92vw",
          maxHeight: "88vh",
          overflowY: "auto"
        }}
      >
        <h3 style={{ marginTop: 0 }}>Assign a task</h3>

        <div style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 4 }}>Assign to</div>
          <div
            style={{
              border: "1px solid #e1e4e8",
              borderRadius: 6,
              maxHeight: 160,
              overflowY: "auto",
              padding: 8
            }}
          >
            {people.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "#7f8c8d" }}>
                Nobody reports to you yet.
              </p>
            ) : (
              people.map((p) => (
                <label key={p.id} style={{ display: "flex", gap: 8, padding: "3px 0" }}>
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={() => togglePerson(p.id)}
                  />
                  <span>{p.name}</span>
                </label>
              ))
            )}
          </div>
        </div>

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
            onChange={(e) => setPriority(e.target.value)}
            style={{ display: "block", marginTop: 4, padding: 8 }}
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          Notes (optional)
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            style={{ display: "block", width: "100%", marginTop: 4, padding: 8 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          Document link (optional)
          <input
            type="text"
            value={documentLink}
            onChange={(e) => setDocumentLink(e.target.value)}
            style={{ display: "block", width: "100%", marginTop: 4, padding: 8 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          Meeting link (optional)
          <input
            type="text"
            value={meetingLink}
            onChange={(e) => setMeetingLink(e.target.value)}
            style={{ display: "block", width: "100%", marginTop: 4, padding: 8 }}
          />
        </label>

        {error ? <p style={{ color: "#c0392b", fontSize: 13 }}>{error}</p> : null}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={saving}>
            {saving ? "Assigning..." : "Assign task"}
          </button>
        </div>
      </div>
    </div>
  );
}
