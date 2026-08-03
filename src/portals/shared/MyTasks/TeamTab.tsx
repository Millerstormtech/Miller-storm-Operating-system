import { useCallback, useEffect, useMemo, useState } from "react";
import { todayString } from "../../../lib/tasks/permissions";
import { TaskCard, type Task } from "./TaskCard";
import { AssignTaskModal } from "./AssignTaskModal";

type Person = { id: string; name: string };

export function TeamTab() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAssign, setShowAssign] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, peopleRes] = await Promise.all([
        fetch("/api/tasks?view=team"),
        fetch("/api/tasks/assignable-users")
      ]);
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (peopleRes.ok) setPeople(await peopleRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const today = todayString();

  const byPerson = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const task of tasks) {
      if (!map[task.assignedTo]) map[task.assignedTo] = [];
      map[task.assignedTo].push(task);
    }
    return map;
  }, [tasks]);

  if (loading) return <div style={{ padding: 24 }}>Loading your team...</div>;

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ margin: 0, flex: 1 }}>My Team</h2>
        <button type="button" onClick={() => setShowAssign(true)}>
          Assign task
        </button>
      </div>

      {people.length === 0 ? (
        <p style={{ color: "#7f8c8d" }}>Nobody reports to you yet.</p>
      ) : (
        people.map((person) => {
          const theirs = byPerson[person.id] ?? [];
          const open = theirs.filter((t) => t.status !== "done");
          const overdue = open.filter((t) => (t.deadline ?? "") < today);
          const done = theirs.filter((t) => t.status === "done");
          const isOpen = expanded === person.id;

          return (
            <div
              key={person.id}
              style={{
                border: "1px solid #e1e4e8",
                borderRadius: 8,
                padding: 14,
                marginBottom: 10
              }}
            >
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : person.id)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  width: "100%",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center"
                }}
              >
                <span style={{ fontWeight: 600, flex: 1 }}>{person.name}</span>
                <span style={{ fontSize: 13, color: "#7f8c8d" }}>
                  {open.length} open
                  {overdue.length > 0 ? (
                    <span style={{ color: "#c0392b" }}> · {overdue.length} overdue</span>
                  ) : null}
                  {" · "}
                  {done.length} done
                </span>
              </button>

              {isOpen ? (
                <div style={{ marginTop: 12 }}>
                  {theirs.length === 0 ? (
                    <p style={{ fontSize: 13, color: "#7f8c8d" }}>No tasks yet.</p>
                  ) : (
                    theirs.map((task) => (
                      <TaskCard key={task.id} task={task} onChange={() => {}} readOnly />
                    ))
                  )}
                </div>
              ) : null}
            </div>
          );
        })
      )}

      {showAssign ? (
        <AssignTaskModal onClose={() => setShowAssign(false)} onAssigned={load} />
      ) : null}
    </div>
  );
}
