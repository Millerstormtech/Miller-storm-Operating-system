import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  shareUrl: string;
  lessonId?: string;
}

export function ShareModal({ isOpen, onClose, title, shareUrl, lessonId }: ShareModalProps) {
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const { user } = useAuth();

  console.log('ShareModal render - isOpen:', isOpen, 'title:', title, 'user:', user?.name, 'lessonId:', lessonId);

  useEffect(() => {
    if (isOpen && user) {
      loadTeamMembers();
    }
  }, [isOpen, user]);

  async function loadTeamMembers() {
    if (!user) return;
    
    setLoading(true);
    try {
      // Fetch current user's full data to get managerId
      const currentUserRes = await fetch(`/api/users/${user.id}`);
      let currentUserData = user;
      if (currentUserRes.ok) {
        currentUserData = await currentUserRes.json();
      }
      
      const res = await fetch('/api/users');
      if (res.ok) {
        const allUsers = await res.json();
        
        console.log('Current user:', currentUserData);
        console.log('All users:', allUsers);
        
        // Filter based on user role
        let filtered: any[] = [];
        if (currentUserData.role === 'manager') {
          // Show sales users under this manager
          filtered = allUsers.filter((u: any) => u.managerId === currentUserData.id && u.role === 'sales');
          console.log('Manager - filtered sales users:', filtered);
        } else if (currentUserData.role === 'sales') {
          // Show manager and other sales users under the same manager
          console.log('Sales user managerId:', currentUserData.managerId);
          const myManager = allUsers.find((u: any) => u.id === currentUserData.managerId);
          console.log('Found manager:', myManager);
          
          const teamSales = allUsers.filter((u: any) => 
            u.managerId === currentUserData.managerId && u.role === 'sales' && u.id !== currentUserData.id
          );
          console.log('Team sales users:', teamSales);
          
          if (myManager) {
            filtered = [myManager, ...teamSales];
          } else {
            filtered = teamSales;
          }
          console.log('Sales - final filtered list:', filtered);
        }
        
        setTeamMembers(filtered);
      }
    } catch (error) {
      console.error('Failed to load team members:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleShareWithTeam() {
    if (selectedUsers.size === 0) {
      alert('Please select at least one team member');
      return;
    }

    setSharing(true);
    try {
      // Create notifications for each selected user
      const notificationPromises = Array.from(selectedUsers).map(userId => 
        fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            type: 'lesson_share',
            title: 'Lesson Shared',
            message: `${user?.name} shared a lesson with you: ${title}`,
            metadata: {
              shareUrl,
              lessonId: lessonId || '',
              sharedBy: user?.id,
              sharedByName: user?.name,
            }
          }),
        })
      );

      const results = await Promise.all(notificationPromises);
      const allSuccessful = results.every(res => res.ok);

      if (allSuccessful) {
        setShareSuccess(true);
        setTimeout(() => {
          setShareSuccess(false);
          setSelectedUsers(new Set());
          onClose();
        }, 2000);
      } else {
        alert('Failed to share lesson with some users');
      }
    } catch (error) {
      console.error('Failed to share:', error);
      alert('Failed to share lesson');
    } finally {
      setSharing(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="overlay"
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
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        className="dialog"
        style={{
          maxWidth: 500,
          backgroundColor: 'white',
          borderRadius: 8,
          padding: 24,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-title" style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
          Share "{title}"
        </div>

        {/* Team Members Section */}
        {teamMembers.length > 0 ? (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#111827' }}>
              Share with Team Members
            </div>
            {loading ? (
              <div style={{ padding: 16, textAlign: 'center', color: '#6b7280' }}>Loading team members...</div>
            ) : (
              <>
                <div style={{ 
                  maxHeight: 300, 
                  overflowY: 'auto', 
                  border: '1px solid #e5e7eb', 
                  borderRadius: 6,
                  backgroundColor: '#f9fafb'
                }}>
                  {teamMembers.map((member) => (
                    <label
                      key={member.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '12px 16px',
                        cursor: 'pointer',
                        borderBottom: '1px solid #e5e7eb',
                        transition: 'background-color 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.backgroundColor = '#eff6ff';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedUsers.has(member.id)}
                        onChange={(e) => {
                          const newSelected = new Set(selectedUsers);
                          if (e.target.checked) {
                            newSelected.add(member.id);
                          } else {
                            newSelected.delete(member.id);
                          }
                          setSelectedUsers(newSelected);
                        }}
                        style={{ marginRight: 12, cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{member.name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>
                          {member.role.charAt(0).toUpperCase() + member.role.slice(1)} • {member.email}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleShareWithTeam}
                  disabled={selectedUsers.size === 0 || sharing}
                  style={{
                    width: '100%',
                    marginTop: 12,
                    padding: '12px 20px',
                    backgroundColor: shareSuccess ? '#10b981' : (selectedUsers.size === 0 || sharing ? '#9ca3af' : '#2563eb'),
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    fontWeight: 600,
                    cursor: selectedUsers.size === 0 || sharing ? 'not-allowed' : 'pointer',
                    fontSize: 14,
                    transition: 'background-color 0.2s',
                  }}
                >
                  {sharing ? 'Sharing...' : shareSuccess ? '✓ Shared Successfully!' : `Share with ${selectedUsers.size} member${selectedUsers.size !== 1 ? 's' : ''}`}
                </button>
              </>
            )}
          </div>
        ) : (
          <div style={{ padding: 40, textAlign: 'center', color: '#6b7280', marginBottom: 24 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>No Team Members</div>
            <div style={{ fontSize: 14 }}>
              {user?.role === 'manager' ? 'You have no sales team members assigned.' : 'No team members available to share with.'}
            </div>
          </div>
        )}

        <div className="dialog-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            style={{ width: '100%' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
