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
  const [dmUnread, setDmUnread] = useState<Record<string, number>>({});
  const [groupUnread, setGroupUnread] = useState<Record<string, number>>({});
  const [dmPickerOpen, setDmPickerOpen] = useState(false);
  const [dmUsers, setDmUsers] = useState<PickUser[]>([]);
  const [dmUserSearch, setDmUserSearch] = useState("");
  const [dmOpening, setDmOpening] = useState(false);
  // Double-clicking a group opens its info/manage panel; single click opens chat.
  const [infoGroup, setInfoGroup] = useState<ChatGroup | null>(null);
  const groupClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        const dms = data.filter(g => g.isDirect);
        setMyDms(dms);
        // Unread counts (red badges) for the admin's own DMs.
        const ids = dms.map(g => g._id).join(',');
        if (ids) {
          const ur = await fetch(`/api/storm-chat/unread-counts?groupIds=${ids}`);
          if (ur.ok) setDmUnread(await ur.json());
        }
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

  // Group tile: single click → open the chat room; double click → open the
  // group's info/manage panel (admins, members, edit, delete, subgroups).
  function handleGroupClick(group: ChatGroup) {
    if (groupClickTimer.current) {
      clearTimeout(groupClickTimer.current);
      groupClickTimer.current = null;
      setInfoGroup(group);
    } else {
      groupClickTimer.current = setTimeout(() => {
        groupClickTimer.current = null;
        openGroupChat(group);
      }, 240);
    }
  }

  // Open a group's chat: clear its unread badge, mark it read, show the room.
  function openGroupChat(group: ChatGroup) {
    setGroupUnread(prev => ({ ...prev, [group._id]: 0 }));
    setSelectedGroup(group);
    fetch('/api/storm-chat/mark-read', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: group._id })
    }).catch(() => {});
  }

  // One group/subgroup row: click = chat, double-click / ⓘ = manage. Subgroups
  // render smaller and indented under their parent.
  function groupTile(group: ChatGroup, isSub: boolean) {
    const subCount = groups.filter(sg => sg.parentGroupId === group._id).length;
    const unread = groupUnread[group._id] || 0;
    return (
      <button type="button" className="sc-tile"
        onClick={() => handleGroupClick(group)}
        title="Click to open chat · double-click to manage"
        style={isSub ? { background: '#fafbfc' } : undefined}>
        <div style={{ width: isSub ? 36 : 44, height: isSub ? 36 : 44, borderRadius: 12, background: 'linear-gradient(135deg,#374151,#111827)', backgroundImage: group.imageUrl ? `url(${group.imageUrl})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: isSub ? 15 : 18, boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
          {!group.imageUrl && '👥'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isSub ? '↳ ' : ''}{group.name}</div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>{isSub ? 'Subgroup · ' : ''}👥 {group.members.length}{group.admins.length > 0 ? ` · 👑 ${group.admins.length}` : ''}{!isSub && subCount > 0 ? ` · ${subCount} subgroup${subCount === 1 ? '' : 's'}` : ''}</div>
        </div>
        {unread > 0 && (
          <span className="sc-badge">{unread > 99 ? '99+' : unread}</span>
        )}
        <span className="sc-info" title="Manage" onClick={(e) => { e.stopPropagation(); setInfoGroup(group); }}>ⓘ</span>
      </button>
    );
  }

  // Open an existing DM: clear its unread badge, mark it read, show the room.
  async function openDm(dm: ChatGroup) {
    setDmUnread(prev => ({ ...prev, [dm._id]: 0 }));
    setSelectedGroup(dm);
    try {
      await fetch('/api/storm-chat/mark-read', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: dm._id })
      });
    } catch { /* ignore */ }
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
        const data: ChatGroup[] = await response.json();
        setGroups(data);
        // Unread counts (red badges) for all groups + subgroups.
        const ids = data.map(g => g._id).join(',');
        if (ids) {
          const ur = await fetch(`/api/storm-chat/unread-counts?groupIds=${ids}`);
          if (ur.ok) setGroupUnread(await ur.json());
        }
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
        (u.name || '').toLowerCase().includes(query) ||
        (u.email || '').toLowerCase().includes(query)
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
        onMessagePrivately={isDm ? undefined : (id) => openDmWith(id)}
        onBack={() => { setSelectedGroup(null); fetchMyDms(); fetchGroups(); }}
      />
    );
  }

  const dmq = dmUserSearch.trim().toLowerCase();
  const dmPickable = dmUsers
    .filter(u => u.id !== user?.id)
    .filter(u => !dmq || (u.name || '').toLowerCase().includes(dmq) || (u.email || '').toLowerCase().includes(dmq));

  return (
    <div>
      <style>{`
        .sc-wrap { background:#fff; border:1px solid #eef0f3; border-radius:18px; overflow:hidden; box-shadow:0 12px 40px rgba(17,24,39,0.06); }
        .sc-head { background:linear-gradient(135deg,#DC2626 0%,#991b1b 100%); padding:20px 24px; display:flex; align-items:center; gap:16px; }
        .sc-head-badge { width:48px; height:48px; border-radius:14px; background:rgba(255,255,255,0.16); display:flex; align-items:center; justify-content:center; font-size:24px; }
        .sc-btn { border:none; cursor:pointer; font-weight:700; font-size:13.5px; border-radius:999px; padding:9px 18px; display:inline-flex; align-items:center; gap:7px; transition:transform .15s, box-shadow .15s, background .15s; white-space:nowrap; }
        .sc-btn-ghost { background:rgba(255,255,255,0.16); color:#fff; }
        .sc-btn-ghost:hover { background:rgba(255,255,255,0.28); transform:translateY(-1px); }
        .sc-btn-solid { background:#fff; color:#DC2626; box-shadow:0 4px 14px rgba(0,0,0,0.14); }
        .sc-btn-solid:hover { transform:translateY(-1px); box-shadow:0 7px 20px rgba(0,0,0,0.2); }
        .sc-label { font-size:11px; font-weight:800; color:#9ca3af; text-transform:uppercase; letter-spacing:0.8px; display:flex; align-items:center; gap:8px; }
        .sc-label::before { content:''; width:14px; height:2px; background:#DC2626; border-radius:2px; }
        .sc-tile { display:flex; align-items:center; gap:13px; padding:11px 13px; background:#fff; border:1px solid #eef0f3; border-radius:14px; cursor:pointer; text-align:left; width:100%; transition:transform .14s, box-shadow .14s, border-color .14s; }
        .sc-tile:hover { transform:translateY(-2px); box-shadow:0 8px 22px rgba(17,24,39,0.09); border-color:#fecaca; }
        .sc-badge { background:linear-gradient(135deg,#ef4444,#dc2626); color:#fff; font-size:11.5px; font-weight:800; min-width:22px; height:22px; border-radius:11px; display:flex; align-items:center; justify-content:center; padding:0 6px; box-shadow:0 2px 6px rgba(220,38,38,0.4); flex-shrink:0; }
        .sc-info { color:#c4c9d2; font-size:18px; padding:2px 6px; flex-shrink:0; transition:color .15s; }
        .sc-info:hover { color:#DC2626; }
      `}</style>
      {/* ── StormChat — DMs + groups ── */}
      <div className="sc-wrap" style={{ marginBottom: 24 }}>
        <div className="sc-head">
          <div className="sc-head-badge">💬</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#fff', letterSpacing: 0.2 }}>StormChat</div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.82)' }}>Direct messages &amp; group channels</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="sc-btn sc-btn-ghost" onClick={openDmPicker}>✏️ New message</button>
            <button type="button" className="sc-btn sc-btn-solid" onClick={() => { resetForm(); setIsCreating(true); }}>+ Create group</button>
          </div>
        </div>
        <div style={{ padding: '18px 20px' }}>
          {/* Direct Messages */}
          <div className="sc-label" style={{ marginBottom: 10 }}>Direct Messages</div>
          {myDms.length === 0 ? (
            <div style={{ padding: '6px 4px 14px', color: '#9ca3af', fontSize: 13 }}>
              No private messages yet. Use “New message” to start one with any user.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
              {myDms.map(dm => {
                const name = dm.dmOther?.name || 'Direct Message';
                const img = dm.dmOther?.imageUrl || '';
                const unread = dmUnread[dm._id] || 0;
                return (
                  <button key={dm._id} type="button" className="sc-tile" onClick={() => openDm(dm)}>
                    <div style={{ position: 'relative', width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#6b7280,#374151)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, fontSize: 17, fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
                      <span>{name?.[0]?.toUpperCase() || '👤'}</span>
                      {img && <img src={img} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                      <div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'capitalize' }}>{dm.dmOther?.role || 'Private message'}</div>
                    </div>
                    {unread > 0 && (
                      <span className="sc-badge">{unread > 99 ? '99+' : unread}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Groups — single click opens the chat, double click opens the info/manage panel */}
          <div className="sc-label" style={{ margin: '20px 0 10px' }}>
            Groups ({groups.filter(g => !g.parentGroupId).length}){groups.filter(g => g.parentGroupId).length > 0 ? ` · ${groups.filter(g => g.parentGroupId).length} Subgroup${groups.filter(g => g.parentGroupId).length === 1 ? '' : 's'}` : ''}
          </div>
          {groups.filter(g => !g.parentGroupId).length === 0 ? (
            <div style={{ padding: '4px 4px', color: '#9ca3af', fontSize: 13 }}>
              No groups yet. Use “Create group” to make one.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {groups.filter(g => !g.parentGroupId).map(group => {
                const subs = groups.filter(sg => sg.parentGroupId === group._id);
                return (
                  <div key={group._id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {groupTile(group, false)}
                    {subs.map(sub => (
                      <div key={sub._id} style={{ marginLeft: 28 }}>{groupTile(sub, true)}</div>
                    ))}
                  </div>
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
                  <div style={{ position: 'relative', width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#6b7280,#374151)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, fontSize: 16, fontWeight: 600 }}>
                    <span>{u.name?.[0]?.toUpperCase() || '👤'}</span>
                    {u.headshotUrl && <img src={u.headshotUrl} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
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


      {/* Group info / manage panel — opens on double-click or the ⓘ button */}
      {infoGroup && (() => {
        const g = infoGroup;
        const memberUsers = users.filter(u => g.members.includes(u._id));
        const subgroups = groups.filter(sg => sg.parentGroupId === g._id);
        const parent = g.parentGroupId ? groups.find(pg => pg._id === g.parentGroupId) : null;
        return (
          <div onClick={() => setInfoGroup(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ padding: '16px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: '#000', backgroundImage: g.imageUrl ? `url(${g.imageUrl})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{!g.imageUrl && '👥'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                  {parent && <div style={{ fontSize: 12, color: '#2563eb', fontWeight: 600 }}>↳ Subgroup of “{parent.name}”</div>}
                  {g.description && <div style={{ fontSize: 12, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.description}</div>}
                </div>
                <button type="button" onClick={() => setInfoGroup(null)} style={{ background: 'none', border: 'none', fontSize: 22, color: '#9ca3af', cursor: 'pointer', lineHeight: 1 }}>×</button>
              </div>

              <div style={{ overflowY: 'auto', padding: '14px 18px' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                  <button type="button" className="btn-primary btn-small" onClick={() => { setSelectedGroup(g); setInfoGroup(null); }} style={{ padding: '8px 14px', fontSize: 13 }}>💬 Open chat</button>
                  <button type="button" className="btn-ghost btn-small" onClick={() => { startEdit(g); setInfoGroup(null); }} style={{ padding: '8px 14px', fontSize: 13 }}>✏️ Edit group</button>
                  <button type="button" className="btn-ghost btn-small" onClick={() => { startCreateSubgroup(g); setInfoGroup(null); }} style={{ padding: '8px 14px', fontSize: 13 }}>+ Add subgroup</button>
                  <button type="button" className="btn-ghost btn-small" onClick={() => { deleteGroup(g._id); setInfoGroup(null); }} style={{ padding: '8px 14px', fontSize: 13, color: '#dc2626' }}>🗑️ Delete group</button>
                </div>

                <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Members ({memberUsers.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                  {memberUsers.length === 0 ? <div style={{ fontSize: 13, color: '#9ca3af' }}>No members</div> : memberUsers.map(u => (
                    <div key={u._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', background: '#f9fafb', borderRadius: 8 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#4b5563', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13 }}>{u.name?.[0]?.toUpperCase() || '?'}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'capitalize' }}>{u.role}</div>
                      </div>
                      {g.admins.includes(u._id) && <span style={{ fontSize: 11, fontWeight: 600, color: '#DC2626', background: 'rgba(220,38,38,0.1)', padding: '2px 8px', borderRadius: 4 }}>Admin</span>}
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Subgroups ({subgroups.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {subgroups.map(sub => (
                    <div key={sub._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#f9fafb', border: '1px solid #eef0f3', borderRadius: 8 }}>
                      <span style={{ fontSize: 13 }}>💬</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub.name}</span>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>👥 {sub.members.length}</span>
                      <button type="button" title="Open chat" onClick={() => { setSelectedGroup(sub); setInfoGroup(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#6b7280', padding: '2px 5px' }}>💬</button>
                      <button type="button" title="Edit" onClick={() => { startEdit(sub); setInfoGroup(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6b7280', padding: '2px 5px' }}>✏️</button>
                      <button type="button" title="Delete" onClick={() => { deleteGroup(sub._id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#dc2626', padding: '2px 5px' }}>🗑️</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => { startCreateSubgroup(g); setInfoGroup(null); }} style={{ marginTop: 2, padding: '6px 8px', border: '1px dashed #d1d5db', borderRadius: 8, background: '#fff', color: '#6b7280', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>+ Add Subgroup</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
