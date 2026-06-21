import type { NextPage } from "next";
import React, { useEffect, useState, useRef } from "react";
import { SalesLayout } from "../../src/portals/sales/SalesLayout";
import { useAuth } from "../../src/contexts/AuthContext";

type Task = {
  id: string;
  assignedOn: string;
  description: string;
  deadline: string;
  priority: "low" | "medium" | "high";
  status: "not started" | "in progress" | "blocked" | "on hold" | "done";
  notesByManager: string;
  documentLinkByManager: string;
  notesByUser: string;
  supportingLinksByUser: string;
  meetingLink: string;
  assignedTo: string | string[];
  customFields: Record<string, string>;
  editableFields: string[];
};

const TaskTracker: NextPage = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const tableRef = useRef<HTMLTableElement>(null);
  
  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState<Partial<Task>>({});
  const [saving, setSaving] = useState(false);

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
    assignedOn: 120,
    description: 200,
    deadline: 120,
    priority: 100,
    status: 120,
    notesByManager: 200,
    notesByUser: 200,
    documentLinkByManager: 200,
    supportingLinksByUser: 200,
    meetingLink: 150,
    actions: 120
  });
  const [isResizing, setIsResizing] = useState(false);
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);

  // Load tasks assigned to the current user
  useEffect(() => {
    let mounted = true;

    async function loadTasks() {
      if (!user?.id) {
        if (mounted) setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const tasksRes = await fetch(`/api/tasks`);
        if (tasksRes.ok && mounted) {
          const data = await tasksRes.json();
          // Filter tasks assigned to the current user (handle both string and array formats)
          const userTasks = data.filter((task: Task) => {
            if (Array.isArray(task.assignedTo)) {
              return task.assignedTo.includes(user.id);
            }
            return task.assignedTo === user.id;
          });
          setTasks(userTasks);
        }
      } catch (error) {
        console.error("Failed to load tasks:", error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    if (user?.id) {
      loadTasks();
    }

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  // Resizable column handlers
  const handleMouseDown = (columnKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizingColumn(columnKey);
    setStartX(e.clientX);
    setStartWidth(columnWidths[columnKey as keyof typeof columnWidths] || 150);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing || !resizingColumn) return;
    
    const newWidth = startWidth + (e.clientX - startX);
    const minWidth = 80; // Minimum column width
    if (newWidth >= minWidth) {
      setColumnWidths(prev => ({
        ...prev,
        [resizingColumn]: newWidth
      }));
    }
  };

  const handleMouseUp = () => {
    setIsResizing(false);
    setResizingColumn(null);
  };

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, resizingColumn, startX, startWidth]);

  // Get all unique custom field keys across all tasks
  const customFieldKeys = tasks.reduce((keys: string[], task) => {
    if (task.customFields) {
      Object.keys(task.customFields).forEach(key => {
        if (!keys.includes(key)) {
          keys.push(key);
        }
      });
    }
    return keys;
  }, []);

  // Initialize custom field widths
  useEffect(() => {
    setColumnWidths(prev => {
      const newWidths = { ...prev };
      customFieldKeys.forEach(key => {
        if (!(key in newWidths)) {
          newWidths[key as keyof typeof newWidths] = 150;
        }
      });
      return newWidths;
    });
  }, [customFieldKeys.join(',')]);

  function getPriorityColor(priority: string) {
    switch (priority) {
      case 'high':
        return '#dc2626'; // red-600
      case 'medium':
        return '#d97706'; // amber-600
      case 'low':
        return '#059669'; // emerald-600
      default:
        return '#6b7280';
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'done':
        return '#059669'; // emerald-600
      case 'in progress':
        return '#2563eb'; // blue-600
      case 'blocked':
        return '#dc2626'; // red-600
      case 'on hold':
        return '#d97706'; // amber-600
      case 'not started':
        return '#6b7280'; // gray-500
      default:
        return '#6b7280';
    }
  }

  // Edit handlers
  const handleEditTask = (task: Task) => {
    // Ensure editableFields exists
    const taskWithEditableFields = {
      ...task,
      editableFields: task.editableFields || []
    };
    setEditingTask(taskWithEditableFields);
    setFormData({
      assignedOn: task.assignedOn,
      description: task.description,
      deadline: task.deadline,
      priority: task.priority,
      status: task.status,
      notesByManager: task.notesByManager,
      documentLinkByManager: task.documentLinkByManager,
      notesByUser: task.notesByUser,
      supportingLinksByUser: task.supportingLinksByUser,
      meetingLink: task.meetingLink,
      customFields: { ...task.customFields }
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editingTask) return;
    
    setSaving(true);
    try {
      // Only update editable fields!
      const updateData: Partial<Task> = {
        ...editingTask, // Keep all original fields
        editableFields: editingTask.editableFields // Don't change editable fields
      };

      // Only update fields that are in editableFields!
      editingTask.editableFields.forEach(field => {
        if (field in formData) {
          // @ts-ignore
          updateData[field] = formData[field];
        }
        // Check if it's a custom field
        if (editingTask.customFields && field in editingTask.customFields) {
          if (!updateData.customFields) {
            updateData.customFields = {};
          }
          updateData.customFields[field] = formData.customFields?.[field] || '';
        }
      });

      const res = await fetch("/api/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData)
      });

      if (res.ok) {
        const savedTask = await res.json();
        // Update tasks in state
        setTasks(tasks.map(t => t.id === savedTask.id ? savedTask : t));
        setShowEditModal(false);
        setEditingTask(null);
      } else {
        alert("Failed to update task");
      }
    } catch (error) {
      console.error("Failed to update task:", error);
      alert("Failed to update task");
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <SalesLayout currentView="task-tracker">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
            <div style={{ color: '#6b7280' }}>Loading...</div>
          </div>
        </div>
      </SalesLayout>
    );
  }

  return (
    <SalesLayout currentView="task-tracker">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0', paddingTop: '0' }}>
        <h1 className="page-title" style={{ marginTop: '0', marginBottom: '0' }}>My Tasks</h1>
      </div>
      
      <div className="panel" style={{ marginTop: '16px' }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
            <div style={{ textAlign: 'center' }}>
              <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
              <div style={{ color: '#6b7280' }}>Loading tasks...</div>
            </div>
          </div>
        ) : tasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{ color: '#6b7280', fontSize: '18px' }}>No tasks assigned to you yet.</div>
          </div>
        ) : (
          <div style={{ 
              overflowX: 'auto', 
              paddingBottom: '8px',
              border: '2px solid #000000',
              borderRadius: '8px',
              backgroundColor: '#ffffff'
            }}>
            <table 
                ref={tableRef}
                style={{ width: '100%', minWidth: '2120px', borderCollapse: 'collapse', tableLayout: 'fixed' }}
              >
              <thead>
                <tr style={{ backgroundColor: '#000000' }}>
                  <th style={{ 
                    padding: '12px 16px', 
                    textAlign: 'left', 
                    border: '1px solid #ffffff', 
                    fontSize: '14px', 
                    fontWeight: 600, 
                    color: '#ffffff', 
                    whiteSpace: 'nowrap', 
                    width: `${columnWidths.assignedOn}px`,
                    position: 'relative'
                  }}>
                    Assigned On
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: '5px',
                        cursor: 'col-resize',
                        backgroundColor: 'transparent',
                        zIndex: 1
                      }}
                      onMouseDown={(e) => handleMouseDown('assignedOn', e)}
                    />
                  </th>
                  <th style={{ 
                    padding: '12px 16px', 
                    textAlign: 'left', 
                    border: '1px solid #ffffff', 
                    fontSize: '14px', 
                    fontWeight: 600, 
                    color: '#ffffff', 
                    whiteSpace: 'nowrap', 
                    width: `${columnWidths.description}px`,
                    position: 'relative'
                  }}>
                    Task Description
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: '5px',
                        cursor: 'col-resize',
                        backgroundColor: 'transparent',
                        zIndex: 1
                      }}
                      onMouseDown={(e) => handleMouseDown('description', e)}
                    />
                  </th>
                  <th style={{ 
                    padding: '12px 16px', 
                    textAlign: 'left', 
                    border: '1px solid #ffffff', 
                    fontSize: '14px', 
                    fontWeight: 600, 
                    color: '#ffffff', 
                    whiteSpace: 'nowrap', 
                    width: `${columnWidths.deadline}px`,
                    position: 'relative'
                  }}>
                    Deadline
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: '5px',
                        cursor: 'col-resize',
                        backgroundColor: 'transparent',
                        zIndex: 1
                      }}
                      onMouseDown={(e) => handleMouseDown('deadline', e)}
                    />
                  </th>
                  <th style={{ 
                    padding: '12px 16px', 
                    textAlign: 'left', 
                    border: '1px solid #ffffff', 
                    fontSize: '14px', 
                    fontWeight: 600, 
                    color: '#ffffff', 
                    whiteSpace: 'nowrap', 
                    width: `${columnWidths.priority}px`,
                    position: 'relative'
                  }}>
                    Priority
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: '5px',
                        cursor: 'col-resize',
                        backgroundColor: 'transparent',
                        zIndex: 1
                      }}
                      onMouseDown={(e) => handleMouseDown('priority', e)}
                    />
                  </th>
                  <th style={{ 
                    padding: '12px 16px', 
                    textAlign: 'left', 
                    border: '1px solid #ffffff', 
                    fontSize: '14px', 
                    fontWeight: 600, 
                    color: '#ffffff', 
                    whiteSpace: 'nowrap', 
                    width: `${columnWidths.status}px`,
                    position: 'relative'
                  }}>
                    Status
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: '5px',
                        cursor: 'col-resize',
                        backgroundColor: 'transparent',
                        zIndex: 1
                      }}
                      onMouseDown={(e) => handleMouseDown('status', e)}
                    />
                  </th>
                  <th style={{ 
                    padding: '12px 16px', 
                    textAlign: 'left', 
                    border: '1px solid #ffffff', 
                    fontSize: '14px', 
                    fontWeight: 600, 
                    color: '#ffffff', 
                    whiteSpace: 'nowrap', 
                    width: `${columnWidths.notesByManager}px`,
                    position: 'relative'
                  }}>
                    Notes by Manager
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: '5px',
                        cursor: 'col-resize',
                        backgroundColor: 'transparent',
                        zIndex: 1
                      }}
                      onMouseDown={(e) => handleMouseDown('notesByManager', e)}
                    />
                  </th>
                  <th style={{ 
                    padding: '12px 16px', 
                    textAlign: 'left', 
                    border: '1px solid #ffffff', 
                    fontSize: '14px', 
                    fontWeight: 600, 
                    color: '#ffffff', 
                    whiteSpace: 'nowrap', 
                    width: `${columnWidths.notesByUser}px`,
                    position: 'relative'
                  }}>
                    Notes by User
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: '5px',
                        cursor: 'col-resize',
                        backgroundColor: 'transparent',
                        zIndex: 1
                      }}
                      onMouseDown={(e) => handleMouseDown('notesByUser', e)}
                    />
                  </th>
                  <th style={{ 
                    padding: '12px 16px', 
                    textAlign: 'left', 
                    border: '1px solid #ffffff', 
                    fontSize: '14px', 
                    fontWeight: 600, 
                    color: '#ffffff', 
                    whiteSpace: 'nowrap', 
                    width: `${columnWidths.documentLinkByManager}px`,
                    position: 'relative'
                  }}>
                    Document Link by Manager
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: '5px',
                        cursor: 'col-resize',
                        backgroundColor: 'transparent',
                        zIndex: 1
                      }}
                      onMouseDown={(e) => handleMouseDown('documentLinkByManager', e)}
                    />
                  </th>
                  <th style={{ 
                    padding: '12px 16px', 
                    textAlign: 'left', 
                    border: '1px solid #ffffff', 
                    fontSize: '14px', 
                    fontWeight: 600, 
                    color: '#ffffff', 
                    whiteSpace: 'nowrap', 
                    width: `${columnWidths.supportingLinksByUser}px`,
                    position: 'relative'
                  }}>
                    Supporting Links by User
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: '5px',
                        cursor: 'col-resize',
                        backgroundColor: 'transparent',
                        zIndex: 1
                      }}
                      onMouseDown={(e) => handleMouseDown('supportingLinksByUser', e)}
                    />
                  </th>
                  <th style={{ 
                    padding: '12px 16px', 
                    textAlign: 'left', 
                    border: '1px solid #ffffff', 
                    fontSize: '14px', 
                    fontWeight: 600, 
                    color: '#ffffff', 
                    whiteSpace: 'nowrap', 
                    width: `${columnWidths.meetingLink}px`,
                    position: 'relative'
                  }}>
                    Meeting Link
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: '5px',
                        cursor: 'col-resize',
                        backgroundColor: 'transparent',
                        zIndex: 1
                      }}
                      onMouseDown={(e) => handleMouseDown('meetingLink', e)}
                    />
                  </th>
                  {customFieldKeys.map(key => {
                    // Initialize custom field width if not exists
                    if (!(key in columnWidths)) {
                      columnWidths[key] = 150;
                    }
                    return (
                      <th key={key} style={{ 
                        padding: '12px 16px', 
                        textAlign: 'left', 
                        border: '1px solid #ffffff', 
                        fontSize: '14px', 
                        fontWeight: 600, 
                        color: '#ffffff', 
                        whiteSpace: 'nowrap', 
                        width: `${columnWidths[key]}px`,
                        position: 'relative'
                      }}>
                        {key}
                        <div
                          style={{
                            position: 'absolute',
                            right: 0,
                            top: 0,
                            bottom: 0,
                            width: '5px',
                            cursor: 'col-resize',
                            backgroundColor: 'transparent',
                            zIndex: 1
                          }}
                          onMouseDown={(e) => handleMouseDown(key, e)}
                        />
                      </th>
                    );
                  })}
                  <th style={{ 
                    padding: '12px 16px', 
                    textAlign: 'left', 
                    border: '1px solid #ffffff', 
                    fontSize: '14px', 
                    fontWeight: 600, 
                    color: '#ffffff', 
                    whiteSpace: 'nowrap', 
                    width: `${columnWidths.actions}px`,
                    position: 'relative'
                  }}>
                    Actions
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: '5px',
                        cursor: 'col-resize',
                        backgroundColor: 'transparent',
                        zIndex: 1
                      }}
                      onMouseDown={(e) => handleMouseDown('actions', e)}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task, idx) => (
                  <tr key={task.id} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                    <td style={{ 
                      padding: '12px 16px', 
                      verticalAlign: 'top', 
                      fontSize: '14px', 
                      color: '#000000', 
                      whiteSpace: 'nowrap', 
                      border: '1px solid #000000',
                      width: `${columnWidths.assignedOn}px`
                    }}>
                      {new Date(task.assignedOn).toLocaleDateString()}
                    </td>
                    <td style={{ 
                      padding: '12px 16px', 
                      verticalAlign: 'top', 
                      fontSize: '14px', 
                      color: '#000000', 
                      fontWeight: 500, 
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-line',
                      border: '1px solid #000000',
                      width: `${columnWidths.description}px`
                    }}>
                      {task.description}
                    </td>
                    <td style={{ 
                      padding: '12px 16px', 
                      verticalAlign: 'top', 
                      fontSize: '14px', 
                      color: '#000000', 
                      whiteSpace: 'nowrap', 
                      border: '1px solid #000000',
                      width: `${columnWidths.deadline}px`
                    }}>
                      {new Date(task.deadline).toLocaleDateString()}
                    </td>
                    <td style={{ 
                      padding: '12px 16px', 
                      verticalAlign: 'top', 
                      whiteSpace: 'nowrap', 
                      border: '1px solid #000000',
                      width: `${columnWidths.priority}px`
                    }}>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 600,
                            backgroundColor: getPriorityColor(task.priority),
                            color: '#ffffff'
                          }}
                        >
                          {task.priority}
                        </span>
                      </td>
                      <td style={{ 
                      padding: '12px 16px', 
                      verticalAlign: 'top', 
                      whiteSpace: 'nowrap', 
                      border: '1px solid #000000',
                      width: `${columnWidths.status}px`
                    }}>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 600,
                            backgroundColor: getStatusColor(task.status),
                            color: '#ffffff'
                          }}
                        >
                          {task.status}
                        </span>
                      </td>
                      <td style={{ 
                        padding: '12px 16px', 
                        verticalAlign: 'top', 
                        fontSize: '13px', 
                        color: '#000000', 
                        wordBreak: 'break-word',
                        whiteSpace: 'pre-line',
                        border: '1px solid #000000',
                        width: `${columnWidths.notesByManager}px`
                      }}>
                        {task.notesByManager || <span style={{ color: '#9ca3af' }}>-</span>}
                      </td>
                      <td style={{ 
                        padding: '12px 16px', 
                        verticalAlign: 'top', 
                        fontSize: '13px', 
                        color: '#000000', 
                        wordBreak: 'break-word',
                        whiteSpace: 'pre-line',
                        border: '1px solid #000000',
                        width: `${columnWidths.notesByUser}px`
                      }}>
                        {task.notesByUser || <span style={{ color: '#9ca3af' }}>-</span>}
                      </td>
                      <td style={{ 
                        padding: '12px 16px', 
                        verticalAlign: 'top', 
                        fontSize: '13px', 
                        color: '#000000', 
                        wordBreak: 'break-word', 
                        border: '1px solid #000000',
                        width: `${columnWidths.documentLinkByManager}px`
                      }}>
                        {task.documentLinkByManager ? (
                          <a href={task.documentLinkByManager} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', wordBreak: 'break-all' }}>
                            {task.documentLinkByManager}
                          </a>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>-</span>
                        )}
                      </td>
                      <td style={{ 
                        padding: '12px 16px', 
                        verticalAlign: 'top', 
                        fontSize: '13px', 
                        color: '#000000', 
                        wordBreak: 'break-word', 
                        border: '1px solid #000000',
                        width: `${columnWidths.supportingLinksByUser}px`
                      }}>
                        {task.supportingLinksByUser ? (
                          <a href={task.supportingLinksByUser} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', wordBreak: 'break-all' }}>
                            {task.supportingLinksByUser}
                          </a>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>-</span>
                        )}
                      </td>
                      <td style={{ 
                        padding: '12px 16px', 
                        verticalAlign: 'top', 
                        fontSize: '13px', 
                        color: '#000000', 
                        wordBreak: 'break-word', 
                        border: '1px solid #000000',
                        width: `${columnWidths.meetingLink}px`
                      }}>
                        {task.meetingLink ? (
                          <a href={task.meetingLink} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', wordBreak: 'break-all' }}>
                            {task.meetingLink}
                          </a>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>-</span>
                        )}
                      </td>
                      {/* Custom field values */}
                      {customFieldKeys.map(key => {
                        const value = task.customFields?.[key];
                        return (
                          <td key={key} style={{ 
                            padding: '12px 16px', 
                            verticalAlign: 'top', 
                            fontSize: '13px', 
                            color: '#000000', 
                            wordBreak: 'break-word',
                            whiteSpace: 'pre-line',
                            border: '1px solid #000000',
                            width: `${columnWidths[key] || 150}px`
                          }}>
                            {value ? (
                              (value.startsWith('http://') || value.startsWith('https://')) ? (
                                <a href={value} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', wordBreak: 'break-all' }}>
                                  {value}
                                </a>
                              ) : value
                            ) : (
                              <span style={{ color: '#9ca3af' }}>-</span>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ 
                        padding: '12px 16px', 
                        verticalAlign: 'top', 
                        fontSize: '13px', 
                        border: '1px solid #000000',
                        width: `${columnWidths.actions}px`
                      }}>
                        <button
                          onClick={() => handleEditTask(task)}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500
                          }}
                        >
                          Edit
                        </button>
                      </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Task Modal */}
      {showEditModal && editingTask && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            overflowY: 'auto',
            padding: '24px 0'
          }}
          onClick={() => setShowEditModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '24px',
              width: '90%',
              maxWidth: '700px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: 600 }}>
              Edit Task
            </h3>

            {/* Show all default editable fields */}
            {editingTask.editableFields.includes('assignedOn') && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500 }}>
                  Assigned On
                </label>
                <input
                  type="date"
                  value={formData.assignedOn}
                  onChange={(e) => setFormData(prev => ({ ...prev, assignedOn: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
              </div>
            )}

            {editingTask.editableFields.includes('description') && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500 }}>
                  Task Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Enter task description"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    resize: 'vertical'
                  }}
                />
              </div>
            )}

            {editingTask.editableFields.includes('deadline') && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500 }}>
                  Deadline
                </label>
                <input
                  type="date"
                  value={formData.deadline}
                  onChange={(e) => setFormData(prev => ({ ...prev, deadline: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
              </div>
            )}

            {editingTask.editableFields.includes('priority') && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500 }}>
                  Priority
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value as any }))}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            )}

            {editingTask.editableFields.includes('status') && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500 }}>
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as any }))}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="not started">Not Started</option>
                  <option value="in progress">In Progress</option>
                  <option value="blocked">Blocked</option>
                  <option value="on hold">On Hold</option>
                  <option value="done">Done</option>
                </select>
              </div>
            )}

            {editingTask.editableFields.includes('notesByManager') && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500 }}>
                  Notes by Manager
                </label>
                <textarea
                  value={formData.notesByManager}
                  onChange={(e) => setFormData(prev => ({ ...prev, notesByManager: e.target.value }))}
                  placeholder="Enter notes for the user"
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    resize: 'vertical'
                  }}
                />
              </div>
            )}

            {editingTask.editableFields.includes('documentLinkByManager') && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500 }}>
                  Document Link by Manager
                </label>
                <input
                  type="text"
                  value={formData.documentLinkByManager}
                  onChange={(e) => setFormData(prev => ({ ...prev, documentLinkByManager: e.target.value }))}
                  placeholder="Enter document URL (Loom, Google Docs, etc.)"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
              </div>
            )}

            {editingTask.editableFields.includes('notesByUser') && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500 }}>
                  Notes by User
                </label>
                <textarea
                  value={formData.notesByUser}
                  onChange={(e) => setFormData(prev => ({ ...prev, notesByUser: e.target.value }))}
                  placeholder="Enter user notes"
                  rows={5}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    resize: 'vertical'
                  }}
                />
              </div>
            )}

            {editingTask.editableFields.includes('supportingLinksByUser') && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500 }}>
                  Supporting Links by User
                </label>
                <input
                  type="text"
                  value={formData.supportingLinksByUser}
                  onChange={(e) => setFormData(prev => ({ ...prev, supportingLinksByUser: e.target.value }))}
                  placeholder="Enter supporting links"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
              </div>
            )}

            {editingTask.editableFields.includes('meetingLink') && (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500 }}>
                  Meeting Link
                </label>
                <input
                  type="text"
                  value={formData.meetingLink}
                  onChange={(e) => setFormData(prev => ({ ...prev, meetingLink: e.target.value }))}
                  placeholder="Enter meeting URL"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
              </div>
            )}

            {/* Custom Fields */}
            {Object.entries(editingTask.customFields || {}).map(([key, value]) => {
              if (editingTask.editableFields.includes(key)) {
                return (
                  <div key={key} style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500 }}>
                      {key}
                    </label>
                    <input
                      type="text"
                      value={formData.customFields?.[key] || ''}
                      onChange={(e) => {
                        setFormData(prev => ({
                          ...prev,
                          customFields: {
                            ...prev.customFields,
                            [key]: e.target.value
                          }
                        }));
                      }}
                      placeholder={`Enter ${key}`}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px'
                      }}
                    />
                  </div>
                );
              }
              return null;
            })}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingTask(null);
                }}
                disabled={saving}
                style={{
                  padding: '10px 20px',
                  border: '1px solid #d1d5db',
                  backgroundColor: 'white',
                  color: '#374151',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: saving ? 'not-allowed' : 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary btn-success"
                onClick={handleSaveEdit}
                disabled={saving}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: saving ? 'not-allowed' : 'pointer'
                }}
              >
                {saving ? "Saving..." : "Update Task"}
              </button>
            </div>
          </div>
        </div>
      )}
    </SalesLayout>
  );
};

export default TaskTracker;
