import type { NextPage } from "next";
import { ManagerLayout } from "../../src/portals/manager/ManagerLayout";
import { useEffect, useState, useRef } from "react";
import { UserProfile } from "../../src/types";
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
  assignedTo: string | string[]; // Accept both formats for backward compatibility
  customFields: Record<string, string>; // Custom fields as key-value pairs
  editableFields: string[]; // Fields that user can edit
};

const TaskManagerPage: NextPage = () => {
  const { user } = useAuth();
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const membersContainerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  
  // Column widths for resizable table
  const defaultColumnWidths: Record<string, number> = {
    assignedOn: 120,
    description: 200,
    deadline: 120,
    priority: 100,
    status: 120,
    notesByManager: 150,
    notesByUser: 150,
    documentLinkByManager: 250,
    supportingLinksByUser: 250,
    meetingLink: 250,
    actions: 150
  };
  
  const [columnWidths, setColumnWidths] = useState(defaultColumnWidths);
  const [isResizing, setIsResizing] = useState(false);
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);
  
  // Custom field for form
  type CustomFieldForm = {
    id: string;
    name: string;
    value: string;
    editable: boolean;
  };

  // Form state
  const [formData, setFormData] = useState<Partial<Task> & { showAssignDropdown?: boolean }>({
    assignedOn: new Date().toISOString().split('T')[0],
    description: '',
    deadline: '',
    priority: 'medium',
    status: 'not started',
    notesByManager: '',
    documentLinkByManager: '',
    notesByUser: '',
    supportingLinksByUser: '',
    meetingLink: '',
    assignedTo: [],
    customFields: {},
    editableFields: ['status', 'notesByUser', 'supportingLinksByUser', 'meetingLink'], // Default editable fields
    showAssignDropdown: false
  });

  // Custom fields state for form
  const [customFields, setCustomFields] = useState<CustomFieldForm[]>([]);

  useEffect(() => {
    async function loadTeamMembers() {
      try {
        const res = await fetch("/api/users");
        if (res.ok) {
          const users = await res.json();
          // Filter by sales role and managerId matching current user's id
          setTeamMembers(users.filter((u: UserProfile) => 
            u.role === "sales" && u.managerId === user?.id
          ));
        }
      } catch (error) {
        console.error("Failed to load team members:", error);
      }
    }
    if (user) {
      loadTeamMembers();
    }
  }, [user]);

  useEffect(() => {
    async function loadTasks() {
      try {
        const res = await fetch("/api/tasks");
        if (res.ok) {
          const loadedTasks = await res.json() as Task[];
          console.log('Loaded tasks:', loadedTasks);
          console.log('Each task editableFields:', loadedTasks.map((t: Task) => t.editableFields));
          // Ensure all tasks have editableFields
          const tasksWithEditableFields = loadedTasks.map((task: Task) => ({
            ...task,
            editableFields: task.editableFields || []
          }));
          setTasks(tasksWithEditableFields);
        }
      } catch (error) {
        console.error("Failed to load tasks:", error);
      }
    }
    loadTasks();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setFormData(prev => ({ ...prev, showAssignDropdown: false }));
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const filteredMembers = teamMembers.filter(member => 
    member.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedMember = teamMembers.find(m => m.id === selectedMemberId);
  
  const selectedMemberTasks = tasks.filter(task => {
    if (!selectedMemberId) return false;
    // Handle both old format (array) and new format (single string)
    if (Array.isArray(task.assignedTo)) {
      return task.assignedTo.includes(selectedMemberId);
    }
    return task.assignedTo === selectedMemberId;
  });

  // Get all unique custom field keys from selected member tasks
  const customFieldKeys = Array.from(
    new Set(
      selectedMemberTasks.flatMap(task => 
        task.customFields ? Object.keys(task.customFields) : []
      )
    )
  );

  const scrollMembers = (direction: 'left' | 'right') => {
    if (membersContainerRef.current) {
      const scrollAmount = 200;
      membersContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  // Custom fields handlers
  const addCustomField = () => {
    setCustomFields(prev => [
      ...prev,
      { id: `custom-${Date.now()}`, name: '', value: '', editable: true }
    ]);
  };

  const removeCustomField = (id: string) => {
    setCustomFields(prev => prev.filter(field => field.id !== id));
  };

  const updateCustomField = (id: string, field: 'name' | 'value', newValue: string) => {
    setCustomFields(prev => 
      prev.map(f => f.id === id ? { ...f, [field]: newValue } : f)
    );
  };

  const toggleCustomFieldEditable = (id: string) => {
    setCustomFields(prev =>
      prev.map(f => f.id === id ? { ...f, editable: !f.editable } : f)
    );
  };

  // Toggle editable fields
  const toggleEditableField = (fieldName: string) => {
    console.log('toggleEditableField called with:', fieldName);
    setFormData(prev => {
      const currentEditable = prev.editableFields || [];
      console.log('Current editable fields:', currentEditable);
      if (currentEditable.includes(fieldName)) {
        return {
          ...prev,
          editableFields: currentEditable.filter(f => f !== fieldName)
        };
      } else {
        return {
          ...prev,
          editableFields: [...currentEditable, fieldName]
        };
      }
    });
  };

  // Resizable column handlers
  const handleMouseDown = (columnKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizingColumn(columnKey);
    setStartX(e.clientX);
    setStartWidth(columnWidths[columnKey] || 150);
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
      document.body.style.cursor = 'col-resize';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizingColumn, startX, startWidth]);

  // Convert custom fields array to object
  const customFieldsToObject = (fields: CustomFieldForm[]): Record<string, string> => {
    return fields.reduce((acc, field) => {
      if (field.name.trim()) {
        acc[field.name.trim()] = field.value;
      }
      return acc;
    }, {} as Record<string, string>);
  };

  // Convert custom fields object to array for form
  const customFieldsToArray = (obj: Record<string, string> = {}, editableFields: string[] = []): CustomFieldForm[] => {
    return Object.entries(obj).map(([name, value], index) => ({
      id: `custom-${Date.now()}-${index}`,
      name,
      value,
      editable: editableFields.includes(name)
    }));
  };

  const handleCreateTask = async () => {
    if (!formData.description?.trim() || !formData.deadline || !formData.assignedTo?.length) {
      alert('Please fill in all required fields: description, deadline, and assign at least one team member');
      return;
    }

    setLoading(true);
    try {
      const customFieldsObj = customFieldsToObject(customFields);
      console.log('Custom fields form data:', customFields);
      console.log('Custom fields object:', customFieldsObj);

      // Collect editable custom fields
      const editableCustomFields = customFields
        .filter(field => field.editable && field.name.trim())
        .map(field => field.name.trim());

      // Combine default editable fields and custom editable fields
      const allEditableFields = [
        ...(formData.editableFields || []),
        ...editableCustomFields
      ].filter((value, index, self) => self.indexOf(value) === index); // Remove duplicates

      const taskData = {
        assignedOn: formData.assignedOn || new Date().toISOString().split('T')[0],
        description: formData.description,
        deadline: formData.deadline,
        priority: formData.priority as "low" | "medium" | "high",
        status: formData.status as "not started" | "in progress" | "blocked" | "on hold" | "done",
        notesByManager: formData.notesByManager || '',
        documentLinkByManager: formData.documentLinkByManager || '',
        notesByUser: formData.notesByUser || '',
        supportingLinksByUser: formData.supportingLinksByUser || '',
        meetingLink: formData.meetingLink || '',
        assignedTo: formData.assignedTo || [],
        customFields: customFieldsObj,
        editableFields: allEditableFields
      };

      console.log('Sending task data to API:', taskData);
      console.log('allEditableFields:', allEditableFields);

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskData)
      });

      if (res.ok) {
        const savedTasks = await res.json();
        // Handle both single task and array of tasks
        const newTasks = Array.isArray(savedTasks) ? savedTasks : [savedTasks];
        setTasks([...tasks, ...newTasks]);
        setShowCreateModal(false);
        // Reset form
        setFormData({
          assignedOn: new Date().toISOString().split('T')[0],
          description: '',
          deadline: '',
          priority: 'medium',
          status: 'not started',
          notesByManager: '',
          documentLinkByManager: '',
          notesByUser: '',
          supportingLinksByUser: '',
          meetingLink: '',
          assignedTo: [],
          customFields: {},
          editableFields: ['status', 'notesByUser', 'supportingLinksByUser', 'meetingLink'], // Default editable fields
          showAssignDropdown: false
        });
        setCustomFields([]); // Reset custom fields
      } else {
        alert("Failed to save task");
      }
    } catch (error) {
      console.error("Failed to create task:", error);
      alert("Failed to save task");
    } finally {
      setLoading(false);
    }
  };

  const handleEditTask = (task: Task) => {
    console.log('handleEditTask task:', task);
    console.log('task.editableFields:', task.editableFields);
    console.log('task.customFields:', task.customFields);
    
    setEditingTask(task);
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
      assignedTo: Array.isArray(task.assignedTo) ? task.assignedTo : [task.assignedTo],
      customFields: task.customFields || {},
      editableFields: task.editableFields || [],
      showAssignDropdown: false
    });
    // Populate custom fields from task
    const customFieldsArray = customFieldsToArray(task.customFields || {}, task.editableFields || []);
    console.log('customFieldsArray:', customFieldsArray);
    setCustomFields(customFieldsArray);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editingTask || !formData.description?.trim() || !formData.deadline) {
      alert('Please fill in all required fields: description and deadline');
      return;
    }

    setLoading(true);
    try {
      // For backward compatibility: if editingTask might have array assignedTo
      // Convert to single string using the first user or keep as string
      const originalAssignedTo = Array.isArray(editingTask.assignedTo) 
        ? editingTask.assignedTo[0] 
        : editingTask.assignedTo;

      // Collect editable custom fields
      const editableCustomFields = customFields
        .filter(field => field.editable && field.name.trim())
        .map(field => field.name.trim());

      // Combine default editable fields and custom editable fields
      const allEditableFields = [
        ...(formData.editableFields || editingTask.editableFields || []),
        ...editableCustomFields
      ].filter((value, index, self) => self.indexOf(value) === index); // Remove duplicates

      const updatedTask: Task = {
        ...editingTask,
        assignedOn: formData.assignedOn || editingTask.assignedOn,
        description: formData.description,
        deadline: formData.deadline,
        priority: formData.priority as "low" | "medium" | "high",
        status: formData.status as "not started" | "in progress" | "blocked" | "on hold" | "done",
        notesByManager: formData.notesByManager || '',
        documentLinkByManager: formData.documentLinkByManager || '',
        notesByUser: formData.notesByUser || '',
        supportingLinksByUser: formData.supportingLinksByUser || '',
        meetingLink: formData.meetingLink || '',
        assignedTo: originalAssignedTo, // Keep original assigned user
        customFields: customFieldsToObject(customFields),
        editableFields: allEditableFields
      };
      console.log('handleSaveEdit updatedTask:', updatedTask);
      console.log('allEditableFields:', allEditableFields);

      const res = await fetch("/api/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedTask)
      });

      if (res.ok) {
        const savedTask = await res.json();
        setTasks(tasks.map(t => t.id === savedTask.id ? savedTask : t));
        setShowEditModal(false);
        setEditingTask(null);
        setCustomFields([]); // Reset custom fields
      } else {
        alert("Failed to update task");
      }
    } catch (error) {
      console.error("Failed to update task:", error);
      alert("Failed to update task");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) {
      return;
    }

    try {
      const res = await fetch("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId })
      });

      if (res.ok) {
        setTasks(tasks.filter(t => t.id !== taskId));
      } else {
        alert("Failed to delete task");
      }
    } catch (error) {
      console.error("Failed to delete task:", error);
      alert("Failed to delete task");
    }
  };

  const toggleAssignedTo = (memberId: string) => {
    setFormData(prev => {
      let current = prev.assignedTo || [];
      // If current is a string, convert it to an array
      if (typeof current === 'string') {
        current = [current];
      }
      return {
        ...prev,
        assignedTo: current.includes(memberId) 
          ? current.filter(id => id !== memberId)
          : [...current, memberId]
      };
    });
  };

  const openAddTaskForMember = () => {
    if (selectedMember) {
      // Collect all unique custom field keys from the selected user's existing tasks
      const existingKeys = new Set<string>();
      const fieldEditability = new Map<string, boolean>();
      
      selectedMemberTasks.forEach(task => {
        if (task.customFields) {
          Object.keys(task.customFields).forEach(key => {
            existingKeys.add(key);
            // Check if this field was editable in any existing task
            if (task.editableFields && task.editableFields.includes(key)) {
              fieldEditability.set(key, true);
            } else if (!fieldEditability.has(key)) {
              // Only set to false if we haven't already found it to be editable
              fieldEditability.set(key, false);
            }
          });
        }
      });

      // Convert keys to custom fields form array with preserved editability
      const initialCustomFields: CustomFieldForm[] = Array.from(existingKeys).map((key, index) => ({
        id: `custom-${Date.now()}-${index}`,
        name: key,
        value: '',
        editable: fieldEditability.get(key) || false
      }));

      setFormData({
        assignedOn: new Date().toISOString().split('T')[0],
        description: '',
        deadline: '',
        priority: 'medium',
        status: 'not started',
        notesByManager: '',
        documentLinkByManager: '',
        notesByUser: '',
        supportingLinksByUser: '',
        meetingLink: '',
        assignedTo: [selectedMember.id],
        customFields: {},
        editableFields: ['status', 'notesByUser', 'supportingLinksByUser', 'meetingLink'], // Default editable fields
        showAssignDropdown: false
      });
      setCustomFields(initialCustomFields);
      setShowCreateModal(true);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#10b981';
      default: return '#6b7280';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done': return '#10b981';
      case 'in progress': return '#3b82f6';
      case 'blocked': return '#ef4444';
      case 'on hold': return '#f59e0b';
      case 'not started': return '#6b7280';
      default: return '#6b7280';
    }
  };

  return (
    <ManagerLayout currentView="task-manager">
      <style jsx>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0', paddingTop: '0' }}>
        <h1 className="page-title" style={{ marginTop: '0', marginBottom: '0' }}>Team Tasks</h1>
        <button
          className="btn-primary btn-success"
          onClick={() => setShowCreateModal(true)}
        >
          Create Task
        </button>
      </div>
      
      <div className="panel" style={{ marginTop: '16px' }}>
        <div className="panel-header">
          <div className="panel-header-row">
            <div className="panel-header-actions" style={{ width: '100%' }}>
              <input
                className="field-input"
                placeholder="Search members by name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>
        <div className="panel-body">
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px', 
            marginBottom: '24px' 
          }}>
            <button
              type="button"
              onClick={() => scrollMembers('left')}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                backgroundColor: 'white',
                cursor: 'pointer',
                flexShrink: 0,
                fontSize: '18px'
              }}
            >
              ‹
            </button>
            <div
              ref={membersContainerRef}
              className="hide-scrollbar"
              style={{
                display: 'flex', 
                gap: '12px', 
                overflowX: 'auto',
                flex: 1,
                padding: '4px 0',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                WebkitOverflowScrolling: 'touch'
              }}
            >
              {filteredMembers.map(member => (
                <button
                  key={member.id}
                  onClick={() => setSelectedMemberId(member.id)}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: selectedMemberId === member.id ? '2px solid #3b82f6' : '2px solid #e5e7eb',
                    backgroundColor: selectedMemberId === member.id ? '#eff6ff' : '#ffffff',
                    cursor: 'pointer',
                    fontWeight: selectedMemberId === member.id ? '600' : '400',
                    color: '#374151',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}
                >
                  {member.name}
                </button>
              ))}
              {filteredMembers.length === 0 && (
                <div style={{ color: '#6b7280', padding: '10px' }}>
                  No team members match your search.
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => scrollMembers('right')}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                backgroundColor: 'white',
                cursor: 'pointer',
                flexShrink: 0,
                fontSize: '18px'
              }}
            >
              ›
            </button>
          </div>
          
          {selectedMember && (
            <div style={{ marginBottom: '20px' }}>
              <button
                type="button"
                onClick={openAddTaskForMember}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: '1px solid #10b981',
                  backgroundColor: '#f0fdf4',
                  color: '#10b981',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <span>+</span> Add Task for {selectedMember.name}
              </button>
            </div>
          )}
          
          {selectedMember && selectedMemberTasks.length > 0 && (
            <div style={{ 
              overflowX: 'auto', 
              paddingBottom: '8px',
              border: '2px solid #000000',
              borderRadius: '8px',
              backgroundColor: '#ffffff'
            }}>
              <table 
                ref={tableRef}
                style={{ width: '100%', minWidth: '2000px', borderCollapse: 'collapse', tableLayout: 'fixed' }}
              >
                <thead>
                  <tr style={{ backgroundColor: '#000000' }}>
                    {/* Assigned On */}
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
                    {/* Task Description */}
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
                    {/* Deadline */}
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
                    {/* Priority */}
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
                    {/* Status */}
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
                    {/* Notes by Manager */}
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
                    {/* Notes by User */}
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
                    {/* Document Link by Manager */}
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
                    {/* Supporting Links by User */}
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
                    {/* Meeting Link */}
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
                    {/* Custom field columns */}
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
                    {/* Actions */}
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
                  {selectedMemberTasks.map((task, index) => (
                    <tr
                      key={task.id}
                      style={{
                        backgroundColor: index % 2 === 0 ? '#ffffff' : '#f9fafb'
                      }}
                    >
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
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => handleEditTask(task)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '6px',
                              border: '1px solid #3b82f6',
                              backgroundColor: '#eff6ff',
                              color: '#3b82f6',
                              cursor: 'pointer',
                              fontWeight: 500,
                              fontSize: '13px'
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTask(task.id)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '6px',
                              border: '1px solid #ef4444',
                              backgroundColor: '#fef2f2',
                              color: '#ef4444',
                              cursor: 'pointer',
                              fontWeight: 500,
                              fontSize: '13px'
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {selectedMember && selectedMemberTasks.length === 0 && (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center', 
              minHeight: '300px',
              textAlign: 'center',
              padding: '40px'
            }}>
              <div style={{ 
                fontSize: '48px', 
                marginBottom: '20px',
                opacity: 0.3
              }}>
                📋
              </div>
              <h2 style={{ 
                fontSize: '32px', 
                fontWeight: 600, 
                color: '#374151',
                marginBottom: '12px'
              }}>
                {selectedMember.name}
              </h2>
              <p style={{ 
                fontSize: '16px', 
                color: '#6b7280',
                maxWidth: '500px'
              }}>
                This user doesn't have any tasks assigned right now.
              </p>
            </div>
          )}
          
          {!selectedMember && (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center', 
              minHeight: '300px',
              textAlign: 'center',
              padding: '40px'
            }}>
              <div style={{ 
                fontSize: '48px', 
                marginBottom: '20px',
                opacity: 0.3
              }}>
                👥
              </div>
              <h2 style={{ 
                fontSize: '32px', 
                fontWeight: 600, 
                color: '#374151',
                marginBottom: '12px'
              }}>
                Select a Team Member
              </h2>
              <p style={{ 
                fontSize: '16px', 
                color: '#6b7280',
                maxWidth: '500px'
              }}>
                Choose a team member from above to view their tasks.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create Task Modal */}
      {showCreateModal && (
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
          onClick={() => setShowCreateModal(false)}
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
              Create New Task
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '20px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>
                    Assigned On
                  </label>
                  <input
                    type="checkbox"
                    checked={(formData.editableFields || []).includes('assignedOn')}
                    onChange={() => toggleEditableField('assignedOn')}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>User can edit</span>
                </div>
                <input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
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

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>
                    Deadline <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={(formData.editableFields || []).includes('deadline')}
                    onChange={() => toggleEditableField('deadline')}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>User can edit</span>
                </div>
                <input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
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

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>
                    Priority
                  </label>
                  <input
                    type="checkbox"
                    checked={(formData.editableFields || []).includes('priority')}
                    onChange={() => toggleEditableField('priority')}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>User can edit</span>
                </div>
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

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>
                    Status
                  </label>
                  <input
                    type="checkbox"
                    checked={(formData.editableFields || []).includes('status')}
                    onChange={() => toggleEditableField('status')}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>User can edit</span>
                </div>
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
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>
                  Task Description <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="checkbox"
                  checked={(formData.editableFields || []).includes('description')}
                  onChange={() => toggleEditableField('description')}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '12px', color: '#6b7280' }}>User can edit</span>
              </div>
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

            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>
                  Notes by Manager
                </label>
                <input
                  type="checkbox"
                  checked={(formData.editableFields || []).includes('notesByManager')}
                  onChange={() => toggleEditableField('notesByManager')}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '12px', color: '#6b7280' }}>User can edit</span>
              </div>
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

            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>
                  Document Link by Manager
                </label>
                <input
                  type="checkbox"
                  checked={(formData.editableFields || []).includes('documentLinkByManager')}
                  onChange={() => toggleEditableField('documentLinkByManager')}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '12px', color: '#6b7280' }}>User can edit</span>
              </div>
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

            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>
                  Notes by User
                </label>
                <input
                  type="checkbox"
                  checked={(formData.editableFields || []).includes('notesByUser')}
                  onChange={() => toggleEditableField('notesByUser')}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '12px', color: '#6b7280' }}>User can edit</span>
              </div>
              <textarea
                value={formData.notesByUser}
                onChange={(e) => setFormData(prev => ({ ...prev, notesByUser: e.target.value }))}
                placeholder="Enter user notes"
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

            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>
                  Supporting Links by User
                </label>
                <input
                  type="checkbox"
                  checked={(formData.editableFields || []).includes('supportingLinksByUser')}
                  onChange={() => toggleEditableField('supportingLinksByUser')}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '12px', color: '#6b7280' }}>User can edit</span>
              </div>
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

            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>
                  Meeting Link
                </label>
                <input
                  type="checkbox"
                  checked={(formData.editableFields || []).includes('meetingLink')}
                  onChange={() => toggleEditableField('meetingLink')}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '12px', color: '#6b7280' }}>User can edit</span>
              </div>
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

            {/* Custom Fields Section */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>
                  Custom Fields
                </label>
                <button
                  type="button"
                  onClick={addCustomField}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #3b82f6',
                    backgroundColor: '#eff6ff',
                    color: '#3b82f6',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500
                  }}
                >
                  + Add Field
                </button>
              </div>
              {customFields.map((field) => (
                <div key={field.id} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <label style={{ fontSize: '12px', color: '#6b7280' }}>
                        Column Name
                      </label>
                      <input
                        type="checkbox"
                        checked={field.editable}
                        onChange={() => toggleCustomFieldEditable(field.id)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>User can edit</span>
                    </div>
                    <input
                      type="text"
                      value={field.name}
                      onChange={(e) => updateCustomField(field.id, 'name', e.target.value)}
                      placeholder="e.g., Vimeo Link"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px'
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#6b7280' }}>
                      Value
                    </label>
                    <input
                      type="text"
                      value={field.value}
                      onChange={(e) => updateCustomField(field.id, 'value', e.target.value)}
                      placeholder="Enter value"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px'
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCustomField(field.id)}
                    style={{
                      padding: '8px 10px',
                      border: '1px solid #ef4444',
                      backgroundColor: '#fef2f2',
                      color: '#ef4444',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '16px',
                      fontWeight: 'bold',
                      marginBottom: '0px',
                      minWidth: '36px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="Remove field"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500 }}>
                Assign To <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div ref={dropdownRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, showAssignDropdown: !prev.showAssignDropdown }))}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    backgroundColor: 'white',
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  {formData.assignedTo && formData.assignedTo.length > 0
                    ? teamMembers.filter(m => formData.assignedTo?.includes(m.id)).map(m => m.name).join(', ')
                    : 'Select team members...'}
                  <span style={{ float: 'right' }}>▼</span>
                </button>
                {formData.showAssignDropdown && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: '0',
                      right: '0',
                      backgroundColor: 'white',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      marginTop: '4px',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      zIndex: 10
                    }}
                  >
                    {teamMembers.map(member => (
                      <div
                        key={member.id}
                        onClick={() => toggleAssignedTo(member.id)}
                        style={{
                          padding: '10px 14px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          backgroundColor: formData.assignedTo?.includes(member.id) ? '#eff6ff' : 'transparent'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={formData.assignedTo?.includes(member.id)}
                          onChange={() => toggleAssignedTo(member.id)}
                          style={{ margin: 0 }}
                        />
                        <span style={{ fontSize: '14px' }}>{member.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowCreateModal(false)}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary btn-success"
                onClick={handleCreateTask}
                disabled={loading}
              >
                {loading ? "Saving..." : "Create and Assign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {showEditModal && (
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '20px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>
                    Assigned On
                  </label>
                  <input
                    type="checkbox"
                    checked={(formData.editableFields || []).includes('assignedOn')}
                    onChange={() => toggleEditableField('assignedOn')}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>User can edit</span>
                </div>
                <input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
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

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>
                    Deadline <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={(formData.editableFields || []).includes('deadline')}
                    onChange={() => toggleEditableField('deadline')}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>User can edit</span>
                </div>
                <input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
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

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>
                    Priority
                  </label>
                  <input
                    type="checkbox"
                    checked={(formData.editableFields || []).includes('priority')}
                    onChange={() => toggleEditableField('priority')}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>User can edit</span>
                </div>
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

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>
                    Status
                  </label>
                  <input
                    type="checkbox"
                    checked={(formData.editableFields || []).includes('status')}
                    onChange={() => toggleEditableField('status')}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>User can edit</span>
                </div>
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
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>
                  Task Description <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="checkbox"
                  checked={(formData.editableFields || []).includes('description')}
                  onChange={() => toggleEditableField('description')}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '12px', color: '#6b7280' }}>User can edit</span>
              </div>
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

            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>
                  Notes by Manager
                </label>
                <input
                  type="checkbox"
                  checked={(formData.editableFields || []).includes('notesByManager')}
                  onChange={() => toggleEditableField('notesByManager')}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '12px', color: '#6b7280' }}>User can edit</span>
              </div>
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

            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>
                  Document Link by Manager
                </label>
                <input
                  type="checkbox"
                  checked={(formData.editableFields || []).includes('documentLinkByManager')}
                  onChange={() => toggleEditableField('documentLinkByManager')}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '12px', color: '#6b7280' }}>User can edit</span>
              </div>
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

            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>
                  Notes by User
                </label>
                <input
                  type="checkbox"
                  checked={(formData.editableFields || []).includes('notesByUser')}
                  onChange={() => toggleEditableField('notesByUser')}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '12px', color: '#6b7280' }}>User can edit</span>
              </div>
              <textarea
                value={formData.notesByUser}
                onChange={(e) => setFormData(prev => ({ ...prev, notesByUser: e.target.value }))}
                placeholder="Enter user notes"
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

            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>
                  Supporting Links by User
                </label>
                <input
                  type="checkbox"
                  checked={(formData.editableFields || []).includes('supportingLinksByUser')}
                  onChange={() => toggleEditableField('supportingLinksByUser')}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '12px', color: '#6b7280' }}>User can edit</span>
              </div>
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

            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>
                  Meeting Link
                </label>
                <input
                  type="checkbox"
                  checked={(formData.editableFields || []).includes('meetingLink')}
                  onChange={() => toggleEditableField('meetingLink')}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '12px', color: '#6b7280' }}>User can edit</span>
              </div>
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

            {/* Custom Fields Section for Edit */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>
                  Custom Fields
                </label>
                <button
                  type="button"
                  onClick={addCustomField}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #3b82f6',
                    backgroundColor: '#eff6ff',
                    color: '#3b82f6',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500
                  }}
                >
                  + Add Field
                </button>
              </div>
              {customFields.map((field) => (
                <div key={field.id} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <label style={{ fontSize: '12px', color: '#6b7280' }}>
                        Column Name
                      </label>
                      <input
                        type="checkbox"
                        checked={field.editable}
                        onChange={() => toggleCustomFieldEditable(field.id)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>User can edit</span>
                    </div>
                    <input
                      type="text"
                      value={field.name}
                      onChange={(e) => updateCustomField(field.id, 'name', e.target.value)}
                      placeholder="e.g., Vimeo Link"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px'
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#6b7280' }}>
                      Value
                    </label>
                    <input
                      type="text"
                      value={field.value}
                      onChange={(e) => updateCustomField(field.id, 'value', e.target.value)}
                      placeholder="Enter value"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px'
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCustomField(field.id)}
                    style={{
                      padding: '8px 10px',
                      border: '1px solid #ef4444',
                      backgroundColor: '#fef2f2',
                      color: '#ef4444',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '16px',
                      fontWeight: 'bold',
                      marginBottom: '0px',
                      minWidth: '36px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="Remove field"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingTask(null);
                }}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary btn-success"
                onClick={handleSaveEdit}
                disabled={loading}
              >
                {loading ? "Saving..." : "Update Task"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ManagerLayout>
  );
};

export default TaskManagerPage;
