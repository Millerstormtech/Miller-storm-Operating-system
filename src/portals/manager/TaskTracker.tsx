import { useState } from "react";
import { DashboardCard } from "../../components/DashboardCard";
import { Course, UserProfile } from "../../types";

type AssignedTask = {
  id: string;
  userId: string;
  label: string;
  status: "open" | "completed";
};

export function TaskTracker(props: { teamMembers: UserProfile[]; courses: Course[] }) {
  const [selection, setSelection] = useState<
    Record<
      string,
      {
        profile: boolean;
        plan: boolean;
        training: boolean;
        webPage: boolean;
        modules: Record<string, boolean>;
      }
    >
  >({});
  const [tasks, setTasks] = useState<AssignedTask[]>([]);
  const [showAssignWorkModal, setShowAssignWorkModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [workName, setWorkName] = useState("");
  const [workDescription, setWorkDescription] = useState("");

  function getProfileCompletion(member: UserProfile) {
    let score = 0;
    let total = 5;
    
    // Check basic fields
    if (member.name && member.name.trim().length > 0) score++;
    if (member.email && member.email.trim().length > 0) score++;
    if (member.headshotUrl && member.headshotUrl.trim().length > 0) score++;
    if (member.phone && member.phone.trim().length > 0) score++;
    if (member.territory && member.territory.trim().length > 0) score++;
    
    return Math.round((score / total) * 100);
  }

  function getBusinessPlanCompletion(member: UserProfile) {
    const plan = member.businessPlan;
    if (!plan) {
      return 0;
    }
    if (plan.committed) {
      return 100;
    }
    
    let score = 0;
    let total = 6;
    
    if (plan.revenueGoal && plan.revenueGoal > 0) score++;
    if (plan.dealsPerYear && plan.dealsPerYear > 0) score++;
    if (plan.inspectionsNeeded && plan.inspectionsNeeded > 0) score++;
    if (plan.doorsPerYear && plan.doorsPerYear > 0) score++;
    if ((plan as any).avgDealSize && (plan as any).avgDealSize > 0) score++;
    if ((plan as any).closeRate && (plan as any).closeRate > 0) score++;
    
    return Math.round((score / total) * 100);
  }

  function getTrainingCompletion(member: UserProfile) {
    // Calculate based on course progress
    const courseProgress = (member as any).courseProgress;
    if (!courseProgress || courseProgress.length === 0) {
      return 0;
    }
    
    const totalProgress = courseProgress.reduce((sum: number, progress: any) => {
      return sum + (progress.progress || 0);
    }, 0);
    
    return Math.round(totalProgress / courseProgress.length);
  }

  function getWebPageCompletion(member: UserProfile) {
    let score = 0;
    let total = 4;
    
    // Check if user has public profile settings configured
    if (member.publicProfile) {
      if (member.publicProfile.showHeadshot) score++;
      if (member.publicProfile.showEmail || member.publicProfile.showPhone) score++;
    }
    
    // Check if user has username set
    if ((member as any).username && (member as any).username.trim().length > 0) score++;
    
    // Check if user has headshot for web page
    if (member.headshotUrl && member.headshotUrl.trim().length > 0) score++;
    
    return Math.round((score / total) * 100);
  }

  function getModuleCompletion(_member: UserProfile, _course: Course) {
    return 0;
  }

  function toggleStage(
    userId: string,
    stage: "profile" | "plan" | "training" | "webPage" | "module",
    moduleId?: string
  ) {
    setSelection((prev) => {
      const existing =
        prev[userId] ?? {
          profile: false,
          plan: false,
          training: false,
          webPage: false,
          modules: {}
        };
      const nextModules = { ...existing.modules };
      if (stage === "module" && moduleId) {
        nextModules[moduleId] = !nextModules[moduleId];
      }
      const next = {
        profile: stage === "profile" ? !existing.profile : existing.profile,
        plan: stage === "plan" ? !existing.plan : existing.plan,
        training: stage === "training" ? !existing.training : existing.training,
        webPage: stage === "webPage" ? !existing.webPage : existing.webPage,
        modules: nextModules
      };
      return {
        ...prev,
        [userId]: next
      };
    });
  }

  function assignTasksForMember(userId: string) {
    const stages = selection[userId];
    if (!stages) {
      return;
    }

    const member = props.teamMembers.find((m) => m.id === userId);
    if (!member) {
      return;
    }

    const newTasks: AssignedTask[] = [];

    if (stages.profile) {
      newTasks.push({
        id: `task-${member.id}-profile-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        userId: member.id,
        label: "Complete profile & upload headshot",
        status: "open"
      });
    }

    if (stages.plan) {
      newTasks.push({
        id: `task-${member.id}-plan-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        userId: member.id,
        label: "Commit business plan",
        status: "open"
      });
    }

    if (stages.training) {
      newTasks.push({
        id: `task-${member.id}-training-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        userId: member.id,
        label: "Complete training courses",
        status: "open"
      });
    }

    if (stages.webPage) {
      newTasks.push({
        id: `task-${member.id}-webpage-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        userId: member.id,
        label: "Complete web page setup",
        status: "open"
      });
    }

    Object.entries(stages.modules).forEach(([moduleId, checked]) => {
      if (!checked) {
        return;
      }
      const course = props.courses.find((c) => c.id === moduleId);
      const courseTitle = course ? course.title : "Training module";
      newTasks.push({
        id: `task-${member.id}-${moduleId}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        userId: member.id,
        label: `Catch up on ${courseTitle}`,
        status: "open"
      });
    });

    if (newTasks.length === 0) {
      return;
    }

    setTasks((prev) => [...prev, ...newTasks]);
    setSelection((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  }

  function markTaskCompleted(taskId: string) {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, status: "completed" } : task
      )
    );
  }

  function openAssignWorkModal(userId: string) {
    setSelectedUserId(userId);
    setWorkName("");
    setWorkDescription("");
    setShowAssignWorkModal(true);
  }

  function closeAssignWorkModal() {
    setShowAssignWorkModal(false);
    setSelectedUserId(null);
    setWorkName("");
    setWorkDescription("");
  }

  async function handleAssignWork() {
    if (!selectedUserId || !workName.trim()) {
      alert("Please enter a task name");
      return;
    }

    const member = props.teamMembers.find((m) => m.id === selectedUserId);
    if (!member) {
      return;
    }

    try {
      // Create notification for the user
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserId,
          type: "task",
          title: "New Work Assigned",
          message: `${workName}${workDescription.trim() ? ': ' + workDescription : ''}`,
          metadata: {
            taskName: workName,
            taskDescription: workDescription,
            assignedBy: "Manager"
          }
        })
      });

      if (response.ok) {
        // Add task to local state
        const newTask: AssignedTask = {
          id: `task-${selectedUserId}-custom-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`,
          userId: selectedUserId,
          label: workDescription.trim() ? `${workName} - ${workDescription}` : workName,
          status: "open"
        };

        setTasks((prev) => [...prev, newTask]);
        closeAssignWorkModal();
        alert(`Work assigned to ${member.name} successfully! They will receive a notification.`);
      } else {
        alert("Failed to send notification");
      }
    } catch (error) {
      console.error("Error assigning work:", error);
      alert("Failed to assign work");
    }
  }

  const totalAssigned = tasks.length;
  const completedCount = tasks.filter((task) => task.status === "completed")
    .length;
  const outstandingCount = totalAssigned - completedCount;

  return (
    <div>
      <div className="grid grid-3">
        <DashboardCard
          title="Total Tasks Assigned"
          value={totalAssigned.toString()}
        />
        <DashboardCard
          title="Total Tasks Completed"
          value={completedCount.toString()}
        />
        <DashboardCard
          title="Outstanding Tasks"
          value={outstandingCount.toString()}
        />
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <div className="panel-header-row">
            <span>Task Tracker</span>
          </div>
        </div>
        <div className="panel-body">
          {props.teamMembers.length === 0 ? (
            <div className="panel-empty">
              No team members yet. Add sales reps to track tasks.
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `minmax(0, 180px) repeat(4, minmax(0, 160px)) minmax(0, 100px)`,
                  columnGap: 16,
                  rowGap: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 8,
                  padding: "4px 0",
                  borderBottom: "1px solid #e5e7eb",
                  color: "#6b7280"
                }}
              >
                <div>Sales Rep</div>
                <div>Profile</div>
                <div>Business Plan</div>
                <div>Training Center</div>
                <div>Web Page</div>
                <div style={{ textAlign: "right" }}>Actions</div>
              </div>
              {props.teamMembers.map((member, rowIndex) => {
                const profilePct = getProfileCompletion(member);
                const planPct = getBusinessPlanCompletion(member);
                const trainingPct = getTrainingCompletion(member);
                const webPagePct = getWebPageCompletion(member);
                
                const selectionForMember = selection[member.id];
                const hasModuleSelection = selectionForMember
                  ? Object.values(selectionForMember.modules).some(Boolean)
                  : false;
                const hasAnySelection =
                  !!selectionForMember?.profile ||
                  !!selectionForMember?.plan ||
                  !!selectionForMember?.training ||
                  !!selectionForMember?.webPage ||
                  hasModuleSelection;
                  
                return (
                  <div
                    key={member.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: `minmax(0, 180px) repeat(4, minmax(0, 160px)) minmax(0, 100px)`,
                      columnGap: 16,
                      rowGap: 4,
                      alignItems: "center",
                      padding: "12px 0",
                      borderTop:
                        rowIndex === 0
                          ? "1px solid #e5e7eb"
                          : "1px solid #f1f5f9",
                      backgroundColor:
                        rowIndex % 2 === 0 ? "#ffffff" : "#f9fafb"
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>
                        {member.name}
                      </div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                        {member.email}
                      </div>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        {member.territory ?? "No territory"}
                      </div>
                    </div>
                    
                    {/* Profile Progress */}
                    <div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>
                        {profilePct}% complete
                      </div>
                      <div style={{
                        width: "100%",
                        height: 8,
                        backgroundColor: "#e5e7eb",
                        borderRadius: 4,
                        overflow: "hidden"
                      }}>
                        <div style={{
                          width: `${profilePct}%`,
                          height: "100%",
                          backgroundColor: profilePct === 100 ? "#10b981" : profilePct >= 50 ? "#3b82f6" : "#f59e0b",
                          transition: "width 0.3s ease"
                        }} />
                      </div>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          marginTop: 6,
                          fontSize: 10
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selection[member.id]?.profile ?? false}
                          onChange={() => toggleStage(member.id, "profile")}
                        />
                        <span>Assign task</span>
                      </label>
                    </div>
                    
                    {/* Business Plan Progress */}
                    <div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>
                        {planPct}% complete
                      </div>
                      <div style={{
                        width: "100%",
                        height: 8,
                        backgroundColor: "#e5e7eb",
                        borderRadius: 4,
                        overflow: "hidden"
                      }}>
                        <div style={{
                          width: `${planPct}%`,
                          height: "100%",
                          backgroundColor: planPct === 100 ? "#10b981" : planPct >= 50 ? "#3b82f6" : "#f59e0b",
                          transition: "width 0.3s ease"
                        }} />
                      </div>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          marginTop: 6,
                          fontSize: 10
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selection[member.id]?.plan ?? false}
                          onChange={() => toggleStage(member.id, "plan")}
                        />
                        <span>Assign task</span>
                      </label>
                    </div>
                    
                    {/* Training Center Progress */}
                    <div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>
                        {trainingPct}% complete
                      </div>
                      <div style={{
                        width: "100%",
                        height: 8,
                        backgroundColor: "#e5e7eb",
                        borderRadius: 4,
                        overflow: "hidden"
                      }}>
                        <div style={{
                          width: `${trainingPct}%`,
                          height: "100%",
                          backgroundColor: trainingPct === 100 ? "#10b981" : trainingPct >= 50 ? "#3b82f6" : "#f59e0b",
                          transition: "width 0.3s ease"
                        }} />
                      </div>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          marginTop: 6,
                          fontSize: 10
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selection[member.id]?.training ?? false}
                          onChange={() => toggleStage(member.id, "training")}
                        />
                        <span>Assign task</span>
                      </label>
                    </div>
                    
                    {/* Web Page Progress */}
                    <div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>
                        {webPagePct}% complete
                      </div>
                      <div style={{
                        width: "100%",
                        height: 8,
                        backgroundColor: "#e5e7eb",
                        borderRadius: 4,
                        overflow: "hidden"
                      }}>
                        <div style={{
                          width: `${webPagePct}%`,
                          height: "100%",
                          backgroundColor: webPagePct === 100 ? "#10b981" : webPagePct >= 50 ? "#3b82f6" : "#f59e0b",
                          transition: "width 0.3s ease"
                        }} />
                      </div>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          marginTop: 6,
                          fontSize: 10
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selection[member.id]?.webPage ?? false}
                          onChange={() => toggleStage(member.id, "webPage")}
                        />
                        <span>Assign task</span>
                      </label>
                    </div>
                    
                    <div style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="btn-primary btn-success btn-small"
                          disabled={!hasAnySelection}
                          onClick={() => assignTasksForMember(member.id)}
                        >
                          Assign
                        </button>
                        <button
                          type="button"
                          className="btn-primary btn-small"
                          onClick={() => openAssignWorkModal(member.id)}
                          style={{ backgroundColor: "#3b82f6", borderColor: "#3b82f6" }}
                        >
                          Assign Work
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
      {tasks.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-header">
            <div className="panel-header-row">
              <span>Assigned Tasks</span>
            </div>
          </div>
          <div className="panel-body">
            <div className="list">
              {tasks.map((task) => {
                const member = props.teamMembers.find(
                  (m) => m.id === task.userId
                );
                return (
                  <div key={task.id} className="list-item">
                    <div className="list-item-title">{task.label}</div>
                    <div className="list-item-subtitle">
                      {member ? member.name : "Unknown rep"}
                    </div>
                    <div className="list-item-actions">
                      {task.status === "open" ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => markTaskCompleted(task.id)}
                        >
                          Mark completed
                        </button>
                      ) : (
                        <span
                          style={{
                            fontSize: 11,
                            color: "#16a34a",
                            fontWeight: 500
                          }}
                        >
                          Completed
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      
      {/* Assign Work Modal */}
      {showAssignWorkModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
          }}
          onClick={closeAssignWorkModal}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: 8,
              padding: 24,
              width: "90%",
              maxWidth: 500,
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px 0", fontSize: 18, fontWeight: 600 }}>
              Assign Work
            </h3>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 }}>
                Assign to:
              </label>
              <div style={{ fontSize: 14, color: "#6b7280" }}>
                {props.teamMembers.find((m) => m.id === selectedUserId)?.name}
              </div>
            </div>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 }}>
                Task Name <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="text"
                value={workName}
                onChange={(e) => setWorkName(e.target.value)}
                placeholder="Enter task name"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 4,
                  fontSize: 14
                }}
              />
            </div>
            
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 }}>
                Description
              </label>
              <textarea
                value={workDescription}
                onChange={(e) => setWorkDescription(e.target.value)}
                placeholder="Enter task description (optional)"
                rows={4}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 4,
                  fontSize: 14,
                  resize: "vertical"
                }}
              />
            </div>
            
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={closeAssignWorkModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary btn-success"
                onClick={handleAssignWork}
              >
                Assign Work
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
