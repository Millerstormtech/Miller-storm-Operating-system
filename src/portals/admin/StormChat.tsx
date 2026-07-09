import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { StormChatRoom } from "./StormChatRoom";

type User = {
  _id: string;
  name: string;
  email: string;
  role: string;
};

type DmOther = { _id: string; name: string; imageUrl: string; role: string } | null;
type PickUser = { _id?: string; id: string; name: string; email?: string; role: string; headshotUrl?: string };
type ChatGroup = {
  _id: string;
  name: string;
  description: string;
  imageUrl: string;
  members: string[];
  admins: string[];
  onlyAdminCanChat: boolean;
  createdBy: string;
  parentGroupId?: string;
  createdAt: Date;
  isDirect?: boolean;
  dmOther?: DmOther;
};

export function StormChatManagement() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<ChatGroup | null>(null);
  // Admin's own private messages (DMs) — admin participates like any other user.
  const [myDms, setMyDms] = useState<ChatGroup[]>([]);
  const [dmPickerOpen, setDmPickerOpen] = useState(false);
  const [dmUsers, setDmUsers] = useState<PickUser[]>([]);
  const [dmUserSearch, setDmUserSearch] = useState("");
  const [dmOpening, setDmOpening] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  
  // Form states
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupImage, setGroupImage] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [selectedAdmins, setSelectedAdmins] = useState<string[]>([]);
  const [onlyAdminCanChat, setOnlyAdminCanChat] = useState(false);
  // When set, the create form is creating a SUBGROUP under this parent group.
  const [parentGroupId, setParentGroupId] = useState<string>("");

  // Filter states
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetchGroups();
    fetchUsers();
    fetchMyDms();
  }, []);

  // The admin's own private messages (server returns only DMs the admin is in,
  // enriched with the other person's name/avatar). Admins never see DMs they
  // aren't part of — this is participation, not oversight.
  async function fetchMyDms() {
    try {
      const res = await fetch('/api/storm-chat/groups?mine=1');
      if (res.ok) {
        const data: ChatGroup[] = await res.json();
        setMyDms(data.filter(g => g.isDirect));
      }
    } catch (error) {
      console.error('Error fetching DMs:', error);
    }
  }

  async function openDmPicker() {
    setDmPickerOpen(true);
    if (dmUsers.length === 0) {
      try {
        const res = await fetch('/api/users/directory');
        if (res.ok) setDmUsers(await res.json());
      } catch { /* ignore */ }
    }
  }

  // Open (or create) a DM and jump straight into the chat room.
  async function openDmWith(id: string) {
    if (dmOpening) return;
    setDmOpening(true);
    try {
      const res = await fetch('/api/storm-chat/dm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id })
      });
      if (res.ok) {
        const dm: ChatGroup = await res.json();
        setDmPickerOpen(false);
        setDmUserSearch('');
        setMyDms(prev => prev.some(g => g._id === dm._id) ? prev.map(g => g._id === dm._id ? dm : g) : [dm, ...prev]);
        setSelectedGroup(dm);
      } else {
        alert("Couldn't open the conversation. Please try again.");
      }
    } catch {
      alert("Couldn't open the conversation. Please try again.");
    } finally {
      setDmOpening(false);
    }
  }

  useEffect(() => {
    filterUsers();
  }, [users, roleFilter, searchQuery]);

  async function fetchGroups() {
    try {
      const response = await fetch('/api/storm-chat/groups');
      if (response.ok) {
        const data = await response.json();
        setGroups(data);
      }
    } catch (error) {
      console.error('Error fetching groups:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchUsers() {
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  }

  function filterUsers() {
    let filtered = users;
    
    // Filter by role
    if (roleFilter !== "all") {
      filtered = filtered.filter(u => u.role === roleFilter);
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(u => 
        u.name.toLowerCase().includes(query) || 
        u.email.toLowerCase().includes(query)
      );
    }
    
    setFilteredUsers(filtered);
  }

  async function handleImageUpload(file: File) {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        setGroupImage(data.url);
      } else {
        alert('Failed to upload image');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload image');
    } finally {
      setUploading(false);
    }
  }

  async function createGroup() {
    if (!groupName.trim()) {
      alert('Group name is required');
      return;
    }

    if (selectedMembers.length === 0) {
      alert('Please select at least one member');
      return;
    }

    try {
      const response = await fetch('/api/storm-chat/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupName,
          description: groupDescription,
          imageUrl: groupImage,
          members: selectedMembers,
          admins: selectedAdmins,
          onlyAdminCanChat,
          parentGroupId,
          createdBy: user?._id || user?.id
        })
      });

      if (response.ok) {
        const newGroup = await response.json();
        setGroups([newGroup, ...groups]);
        resetForm();
        setIsCreating(false);
      } else {
        alert('Failed to create group');
      }
    } catch (error) {
      console.error('Error creating group:', error);
      alert('Failed to create group');
    }
  }

  async function updateGroup(groupId: string) {
    if (!groupName.trim()) {
      alert('Group name is required');
      return;
    }

    try {
      const response = await fetch(`/api/storm-chat/groups/${groupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupName,
          description: groupDescription,
          imageUrl: groupImage,
          members: selectedMembers,
          admins: selectedAdmins,
          onlyAdminCanChat
        })
      });

      if (response.ok) {
        const updatedGroup = await response.json();
        setGroups(groups.map(g => g._id === groupId ? updatedGroup : g));
        resetForm();
        setIsEditing(null);
      } else {
        alert('Failed to update group');
      }
    } catch (error) {
      console.error('Error updating group:', error);
      alert('Failed to update group');
    }
  }

  async function deleteGroup(groupId: string) {
    if (!confirm('Are you sure you want to delete this group?')) return;

    try {
      const response = await fetch(`/api/storm-chat/groups/${groupId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setGroups(groups.filter(g => g._id !== groupId));
      } else {
        alert('Failed to delete group');
      }
    } catch (error) {
      console.error('Error deleting group:', error);
      alert('Failed to delete group');
    }
  }

  function startEdit(group: ChatGroup) {
    setIsEditing(group._id);
    setGroupName(group.name);
    setGroupDescription(group.description);
    setGroupImage(group.imageUrl);
    setSelectedMembers(group.members);
    setSelectedAdmins(group.admins);
    setOnlyAdminCanChat(group.onlyAdminCanChat);
  }

  // Open the create form as a subgroup of the given parent group.
  function startCreateSubgroup(parent: ChatGroup) {
    resetForm();
    setParentGroupId(parent._id);
    setIsEditing(null);
    setIsCreating(true);
  }

  function resetForm() {
    setGroupName("");
    setGroupDescription("");
    setGroupImage("");
    setSelectedMembers([]);
    setSelectedAdmins([]);
    setOnlyAdminCanChat(false);
    setParentGroupId("");
    setRoleFilter("all");
    setSearchQuery("");
  }

  function toggleMemberSelection(userId: string) {
    setSelectedMembers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  }

  function toggleAdminSelection(userId: string) {
    setSelectedAdmins(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  }

  function selectAllFiltered() {
    const allIds = filteredUsers.map(u => u._id);
    setSelectedMembers(allIds);
  }

  function deselectAll() {
    setSelectedMembers([]);
  }

  function handleGroupDragStart(e: React.DragEvent, groupId: string) {
    setDraggedGroupId(groupId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', groupId);
  }

  function handleGroupDragEnd() {
    setDraggedGroupId(null);
    setDragOverGroupId(null);
  }

  function handleGroupDragOver(e: React.DragEvent, groupId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedGroupId && draggedGroupId !== groupId) {
      setDragOverGroupId(groupId);
    }
  }

  function handleGroupDrop(e: React.DragEvent, targetGroupId: string) {
    e.preventDefault();
    if (!draggedGroupId || draggedGroupId === targetGroupId) {
      setDraggedGroupId(null);
      setDragOverGroupId(null);
      return;
    }
    const reordered = [...groups];
    const fromIndex = reordered.findIndex(g => g._id === draggedGroupId);
    const toIndex = reordered.findIndex(g => g._id === targetGroupId);
    if (fromIndex === -1 || toIndex === -1) return;
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setGroups(reordered);
    setDraggedGroupId(null);
    setDragOverGroupId(null);

    // Persist new order to DB
    fetch('/api/storm-chat/groups/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: reordered.map(g => g._id) })
    }).catch(err => console.error('Failed to save group order:', err));
  }

  function renderUserSelection() {
    return (
      <div style={{ marginTop: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <label className="field-label" style={{ marginBottom: 8, display: 'block' }}>
            Select Members
          </label>
          
          {/* Filters */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <select 
              className="field-input" 
              value={roleFilter} 
              onChange={(e) => setRoleFilter(e.target.value)}
              style={{ width: 200 }}
            >
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="sales">Sales</option>
              <option value="marketing">Marketing</option>
            </select>
            
            <input 
              className="field-input" 
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ flex: 1 }}
            />
            
            <button type="button" className="btn-secondary btn-small" onClick={selectAllFiltered}>
              Select All ({filteredUsers.length})
            </button>
            
            <button type="button" className="btn-secondary btn-small" onClick={deselectAll}>
              Deselect All
            </button>
          </div>
          
          {/* Selected count */}
          <div style={{ marginBottom: 8, fontSize: 14, color: '#6b7280' }}>
            {selectedMembers.length} member(s) selected
          </div>
          
          {/* User list */}
          <div style={{ 
            maxHeight: 400, 
            overflowY: 'auto', 
            border: '1px solid #e5e7eb', 
            borderRadius: 8,
            padding: 12
          }}>
            {filteredUsers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af' }}>
                No users found
              </div>
            ) : (
              filteredUsers.map(user => (
                <div 
                  key={user._id}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    padding: 12,
                    borderBottom: '1px solid #f3f4f6',
                    cursor: 'pointer',
                    backgroundColor: selectedMembers.includes(user._id) ? '#eff6ff' : 'transparent'
                  }}
                  onClick={() => toggleMemberSelection(user._id)}
                >
                  <input 
                    type="checkbox" 
                    checked={selectedMembers.includes(user._id)}
                    onChange={() => toggleMemberSelection(user._id)}
                    style={{ marginRight: 12 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{user.name}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{user.email}</div>
                  </div>
                  <span style={{ 
                    padding: '4px 8px', 
                    borderRadius: 4, 
                    fontSize: 11, 
                    fontWeight: 600,
                    backgroundColor: '#f3f4f6',
                    color: '#374151'
                  }}>
                    {user.role}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        
        {/* Admin selection */}
        {selectedMembers.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <label className="field-label" style={{ marginBottom: 8, display: 'block' }}>
              Assign Group Admins (Optional)
            </label>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
              Group admins can create and manage groups
            </div>
            <div style={{ 
              maxHeight: 200, 
              overflowY: 'auto', 
              border: '1px solid #e5e7eb', 
              borderRadius: 8,
              padding: 12
            }}>
              {users.filter(u => selectedMembers.includes(u._id)).map(user => (
                <div 
                  key={user._id}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    padding: 8,
                    cursor: 'pointer'
                  }}
                  onClick={() => toggleAdminSelection(user._id)}
                >
                  <input 
                    type="checkbox" 
                    checked={selectedAdmins.includes(user._id)}
                    onChange={() => toggleAdminSelection(user._id)}
                    style={{ marginRight: 12 }}
                  />
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{user.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderGroupForm() {
    return (
      <div style={{ borderBottom: "1px solid #e5e7eb", marginBottom: 16, paddingBottom: 16 }}>
        <h3 style={{ marginBottom: 16, color: "#374151" }}>
          {isEditing
            ? 'Edit Group'
            : parentGroupId
              ? `Create Subgroup${groups.find(g => g._id === parentGroupId) ? ` in "${groups.find(g => g._id === parentGroupId)!.name}"` : ''}`
              : 'Create New Group'}
        </h3>
        
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Group Name *</span>
            <input 
              className="field-input" 
              value={groupName} 
              onChange={(e) => setGroupName(e.target.value)} 
              placeholder="Enter group name" 
            />
          </label>
          
          <label className="field">
            <span className="field-label">Group Image</span>
            <div style={{ display: "flex", gap: 8 }}>
              <input 
                className="field-input" 
                value={groupImage} 
                onChange={(e) => setGroupImage(e.target.value)} 
                placeholder="Image URL" 
                style={{ flex: 1 }} 
              />
              <button 
                type="button" 
                className="btn-secondary" 
                disabled={uploading} 
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
              <input 
                ref={fileInputRef} 
                type="file" 
                accept="image/*" 
                style={{ display: "none" }} 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                }} 
              />
            </div>
            {groupImage && (
              <div style={{ marginTop: 12 }}>
                <img 
                  src={groupImage} 
                  alt="Group" 
                  style={{ 
                    width: 100, 
                    height: 100, 
                    objectFit: 'cover', 
                    borderRadius: 8,
                    border: '2px solid #e5e7eb'
                  }} 
                />
              </div>
            )}
          </label>
        </div>
        
        <label className="field" style={{ marginTop: 16 }}>
          <span className="field-label">Description</span>
          <textarea 
            className="field-input" 
            rows={3} 
            value={groupDescription} 
            onChange={(e) => setGroupDescription(e.target.value)} 
            placeholder="Enter group description" 
          />
        </label>
        
        {/* User Selection */}
        {renderUserSelection()}
        
        {/* Action Buttons and Admin-Only Toggle */}
        <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", gap: 12 }}>
            {isEditing ? (
              <>
                <button 
                  type="button" 
                  className="btn-primary btn-success" 
                  onClick={() => updateGroup(isEditing)}
                >
                  Save Changes
                </button>
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={() => {
                    setIsEditing(null);
                    resetForm();
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button 
                  type="button" 
                  className="btn-primary btn-success" 
                  onClick={createGroup}
                >
                  Create Group
                </button>
                <button 
                  type="button" 
                  className="btn-secondary" 
                  style={{ color: "#dc2626" }} 
                  onClick={() => {
                    setIsCreating(false);
                    resetForm();
                  }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
          
          {/* Only Admin Can Chat Toggle - Right Side */}
          <label 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 10,
              padding: '12px 16px',
              border: '2px solid #e5e7eb',
              borderRadius: 8,
              cursor: 'pointer',
              backgroundColor: onlyAdminCanChat ? '#fef2f2' : '#f9fafb',
              borderColor: onlyAdminCanChat ? '#dc2626' : '#e5e7eb',
              transition: 'all 0.2s'
            }}
          >
            <input 
              type="checkbox" 
              checked={onlyAdminCanChat}
              onChange={(e) => setOnlyAdminCanChat(e.target.checked)}
              style={{ 
                width: 18, 
                height: 18,
                cursor: 'pointer'
              }}
            />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: onlyAdminCanChat ? '#dc2626' : '#374151' }}>
                🔒 Only admins can send messages
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                Members can only read messages
              </div>
            </div>
          </label>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Loading...</div>;
  }

  // Show chat room if a group/DM is selected. For a DM pass the other person's
  // name as the title and isMember (the admin's app id can't be matched against
  // the Mongo _ids in members client-side, but they ARE a member).
  if (selectedGroup) {
    const isDm = !!selectedGroup.isDirect;
    return (
      <StormChatRoom
        group={selectedGroup}
        isMember={isDm || undefined}
        title={isDm ? (selectedGroup.dmOther?.name || 'Direct Message') : undefined}
        onBack={() => { setSelectedGroup(null); fetchMyDms(); }}
      />
    );
  }

  const dmq = dmUserSearch.trim().toLowerCase();
  const dmPickable = dmUsers
    .filter(u => u.id !== user?.id)
    .filter(u => !dmq || u.name.toLowerCase().includes(dmq) || (u.email || '').toLowerCase().includes(dmq));

  return (
    <div>
      {/* ── Messages (private DMs) — admin chats like any other user ── */}
      <div className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-header">
          <div className="panel-header-row">
            <span style={{ fontSize: 16, fontWeight: 600 }}>💬 Messages ({myDms.length})</span>
            <button type="button" className="btn-primary btn-small" onClick={openDmPicker}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 14 }}>
              ✏️ New message
            </button>
          </div>
        </div>
        <div className="panel-body">
          {myDms.length === 0 ? (
            <div style={{ padding: '16px 4px', color: '#9ca3af', fontSize: 14 }}>
              No private messages yet. Use “New message” to start one with any user.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {myDms.map(dm => {
                const name = dm.dmOther?.name || 'Direct Message';
                const img = dm.dmOther?.imageUrl || '';
                return (
                  <button key={dm._id} type="button" onClick={() => setSelectedGroup(dm)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                    <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#4b5563', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, fontSize: 18 }}>
                      {img ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👤'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                      <div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'capitalize' }}>{dm.dmOther?.role || 'Private message'}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* New-message people picker (any user) */}
      {dmPickerOpen && (
        <div onClick={() => setDmPickerOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 460, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1f2937' }}>New message</div>
              <button type="button" onClick={() => setDmPickerOpen(false)} style={{ background: 'none', border: 'none', fontSize: 22, color: '#9ca3af', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: '12px 18px' }}>
              <input autoFocus value={dmUserSearch} onChange={e => setDmUserSearch(e.target.value)} placeholder="Search people"
                style={{ width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none' }} />
            </div>
            <div style={{ overflowY: 'auto', padding: '0 8px 12px' }}>
              {dmPickable.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#9ca3af', padding: '30px 0', fontSize: 13 }}>No people found</div>
              ) : dmPickable.map(u => (
                <button key={u.id} type="button" disabled={dmOpening} onClick={() => openDmWith(u._id || u.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'none', border: 'none', cursor: dmOpening ? 'wait' : 'pointer', width: '100%', textAlign: 'left', borderRadius: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#4b5563', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, fontSize: 16 }}>
                    {u.headshotUrl ? <img src={u.headshotUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (u.name?.[0]?.toUpperCase() || '👤')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'capitalize' }}>{u.role}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Form - Only show when creating or editing */}
      {(isCreating || isEditing) && (
        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-header">
            <div className="panel-header-row">
              <span style={{ fontSize: 16, fontWeight: 600 }}>
                {isEditing ? '✏️ Edit Group' : '➕ Create New Group'}
              </span>
              <button 
                type="button" 
                className="btn-ghost btn-small" 
                onClick={() => {
                  if (isEditing) setIsEditing(null);
                  if (isCreating) setIsCreating(false);
                  resetForm();
                }}
                style={{ color: '#6b7280' }}
              >
                ✕ Close
              </button>
            </div>
          </div>
          <div className="panel-body">
            {renderGroupForm()}
          </div>
        </div>
      )}

      {/* Groups List - Always visible */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-header-row">
            <span style={{ fontSize: 16, fontWeight: 600 }}>Groups ({groups.length})</span>
            {!isCreating && !isEditing && (
              <button 
                type="button" 
                className="btn-primary btn-success btn-small" 
                onClick={() => { resetForm(); setIsCreating(true); }}
                style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  fontSize: 14,
                  fontWeight: 600
                }}
              >
                + Create New
              </button>
            )}
          </div>
        </div>
        <div className="panel-body">
          {groups.length === 0 ? (
            <div className="panel-empty">
              <div style={{ fontSize: 48, marginBottom: 16 }}>💬</div>
              <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>No groups yet</div>
              <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
                Create your first group to get started
              </div>
              <button 
                type="button" 
                className="btn-primary btn-success" 
                onClick={() => { resetForm(); setIsCreating(true); }}
              >
                + Create Group
              </button>
            </div>
          ) : (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 12
            }}>
              {groups.filter(g => !g.parentGroupId).map(group => (
                <div
                  key={group._id}
                  draggable={true}
                  onDragStart={(e) => handleGroupDragStart(e, group._id)}
                  onDragEnd={handleGroupDragEnd}
                  onDragOver={(e) => handleGroupDragOver(e, group._id)}
                  onDrop={(e) => handleGroupDrop(e, group._id)}
                  style={{ 
                    padding: 12, 
                    display: 'flex', 
                    flexDirection: 'column',
                    gap: 10,
                    border: dragOverGroupId === group._id ? '2px dashed #DC2626' : '1px solid #e5e7eb',
                    borderRadius: 10,
                    backgroundColor: dragOverGroupId === group._id ? '#fef2f2' : '#fff',
                    transition: 'all 0.2s',
                    position: 'relative',
                    cursor: 'grab',
                    opacity: draggedGroupId === group._id ? 0.45 : 1,
                    transform: draggedGroupId === group._id ? 'rotate(2deg) scale(0.97)' : 'none',
                  }}
                  onClick={() => setSelectedGroup(group)}
                  onMouseEnter={(e) => {
                    if (!draggedGroupId) {
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                      e.currentTarget.style.borderColor = '#d1d5db';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!draggedGroupId) {
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.style.borderColor = '#e5e7eb';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  {/* Header with Image and Actions */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    {/* Drag handle */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      color: '#d1d5db',
                      fontSize: 16,
                      cursor: 'grab',
                      paddingTop: 2,
                      flexShrink: 0,
                      userSelect: 'none'
                    }} title="Drag to reorder">
                      ⠿
                    </div>
                    {/* Group Image */}
                    <div style={{ 
                      width: 48, 
                      height: 48, 
                      borderRadius: 8,
                      backgroundColor: '#000',
                      backgroundImage: group.imageUrl ? `url(${group.imageUrl})` : 'none',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 20,
                      color: '#fff'
                    }}>
                      {!group.imageUrl && '👥'}
                    </div>
                    
                    {/* Group Name */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ 
                        fontSize: 14, 
                        fontWeight: 600, 
                        marginBottom: 2, 
                        color: '#111827',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {group.name}
                      </div>
                      {group.onlyAdminCanChat && (
                        <div style={{ 
                          fontSize: 11, 
                          color: '#dc2626', 
                          fontWeight: 500,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          🔒 Admin-only
                        </div>
                      )}
                    </div>
                    
                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button 
                        type="button" 
                        className="btn-ghost btn-small" 
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(group);
                        }}
                        title="Edit Group"
                        style={{ 
                          color: '#6b7280', 
                          padding: '4px 8px',
                          fontSize: 12
                        }}
                      >
                        ✏️
                      </button>
                      <button 
                        type="button" 
                        className="btn-ghost btn-small" 
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteGroup(group._id);
                        }}
                        title="Delete Group"
                        style={{ 
                          color: '#dc2626', 
                          padding: '4px 8px',
                          fontSize: 12
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  
                  {/* Description */}
                  {group.description && (
                    <div style={{ 
                      fontSize: 12, 
                      color: '#6b7280',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      lineHeight: '1.4',
                      minHeight: '33.6px'
                    }}>
                      {group.description}
                    </div>
                  )}
                  
                  {/* Stats */}
                  <div style={{ 
                    display: 'flex', 
                    gap: 10, 
                    fontSize: 11, 
                    color: '#6b7280',
                    paddingTop: 8,
                    borderTop: '1px solid #f3f4f6'
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      👥 {group.members.length}
                    </span>
                    {group.admins.length > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        👑 {group.admins.length}
                      </span>
                    )}
                  </div>

                  {/* Subgroups */}
                  <div style={{ paddingTop: 8, borderTop: '1px solid #f3f4f6' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      Subgroups
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {groups.filter(sg => sg.parentGroupId === group._id).map(sub => (
                        <div key={sub._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: '#f9fafb', border: '1px solid #eef0f3', borderRadius: 8 }}>
                          <span style={{ fontSize: 13 }}>💬</span>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub.name}</span>
                          <span style={{ fontSize: 11, color: '#9ca3af' }}>👥 {sub.members.length}</span>
                          <button type="button" className="btn-ghost btn-small" title="Edit subgroup" onClick={(e) => { e.stopPropagation(); startEdit(sub); }} style={{ color: '#6b7280', padding: '2px 5px', fontSize: 11 }}>✏️</button>
                          <button type="button" className="btn-ghost btn-small" title="Delete subgroup" onClick={(e) => { e.stopPropagation(); deleteGroup(sub._id); }} style={{ color: '#dc2626', padding: '2px 5px', fontSize: 11 }}>🗑️</button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); startCreateSubgroup(group); }}
                        style={{ marginTop: 2, padding: '6px 8px', border: '1px dashed #d1d5db', borderRadius: 8, background: '#fff', color: '#6b7280', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                      >
                        + Add Subgroup
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
