import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { groupByUrgency, todayString, scopeFor } from "../../../lib/tasks/permissions";
import { TaskCard, type Task } from "./TaskCard";
import { AddTaskModal, type NewTaskInput } from "./AddTaskModal";
import { TeamTab } from "./TeamTab";

const ACCULYNX_URL = "https://app.acculynx.com";

const GROUP_LABELS: Record<string, string> = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming"
};

type TabId = "mine" | "team";

function TabButton(props: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        padding: "8px 14px",
        border: "none",
        borderBottom: props.active ? "2px solid #2c6fbb" : "2px solid transparent",
        background: "none",
        fontWeight: props.active ? 600 : 400,
        cursor: "pointer"
      }}
    >
      {props.label}
    </button>
  );
}

export function MyTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [tab, setTab] = useState<TabId>("mine");

  // Only the scope MODE matters here, and that is decided by the role alone, so
  // the client does not need the branch list the server uses.
  const canSeeTeam = useMemo(() => {
    if (!user) return false;
    return scopeFor({ id: user.id, role: user.role }).mode !== "self";
  }, [user]);

  const loadMine = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks?view=mine");
      if (res.ok) setTasks(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.id) loadMine();
  }, [user?.id, loadMine]);

  async function updateTask(id: string, changes: Partial<Task>) {
    // Optimistic: the list regroups immediately, then reconciles with the server.
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...changes } : t)));
    const res = await fetch("/api/tasks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...changes })
    });
    if (!res.ok) await loadMine();
  }

  async function createTask(input: NewTaskInput) {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, assignedTo: user?.id })
    });
    if (!res.ok) throw new Error("create failed");
    await loadMine();
  }

  const grouped = useMemo(
    () => groupByUrgency(tasks as any, todayString()),
    [tasks]
  );
  const doneTasks = grouped.done as unknown as Task[];

  return (
    <div>
      {canSeeTeam ? (
        <div style={{ display: "flex", gap: 8, padding: "16px 24px 0" }}>
          <TabButton active={tab === "mine"} label="My Tasks" onClick={() => setTab("mine")} />
          <TabButton active={tab === "team"} label="My Team" onClick={() => setTab("team")} />
        </div>
      ) : null}

      {tab === "team" && canSeeTeam ? (
        <TeamTab />
      ) : loading ? (
        <div style={{ padding: 24 }}>Loading your tasks...</div>
      ) : (
        <div style={{ padding: 24, maxWidth: 900 }}>
          {/* No heading here on purpose: the role layout already renders "My Tasks"
              as the page title, and leaders also have a "My Tasks" tab, so a third
              copy just repeats itself down the screen. */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: 18 }}>
            <button type="button" onClick={() => setShowAdd(true)}>
              Add task
            </button>
          </div>

          {(["overdue", "today", "upcoming"] as const).map((key) => {
            const items = grouped[key] as unknown as Task[];
            if (items.length === 0) return null;
            return (
              <section key={key} style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 15, color: key === "overdue" ? "#c0392b" : "#333" }}>
                  {GROUP_LABELS[key]} ({items.length})
                </h3>
                {items.map((task) => (
                  <TaskCard key={task.id} task={task} onChange={updateTask} />
                ))}
              </section>
            );
          })}

          {tasks.length === 0 ? (
            <p style={{ color: "#7f8c8d" }}>
              Nothing on your list. Use "Add task" to note something you need to do.
            </p>
          ) : null}

          {doneTasks.length > 0 ? (
            <section style={{ marginBottom: 24 }}>
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  color: "#2c6fbb"
                }}
              >
                {showDone ? "Hide" : "Show"} done ({doneTasks.length})
              </button>
              {showDone
                ? doneTasks.map((task) => (
                    <TaskCard key={task.id} task={task} onChange={updateTask} />
                  ))
                : null}
            </section>
          ) : null}

          <p style={{ marginTop: 32, fontSize: 13, color: "#7f8c8d" }}>
            Tasks in AccuLynx are separate from this list and are not synced.{" "}
            <a href={ACCULYNX_URL} target="_blank" rel="noopener noreferrer">
              Open my AccuLynx tasks
            </a>
          </p>

          {showAdd ? (
            <AddTaskModal onClose={() => setShowAdd(false)} onCreate={createTask} />
          ) : null}
        </div>
      )}
    </div>
  );
}
