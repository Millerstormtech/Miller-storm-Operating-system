import { useEffect, useState } from "react";
import { useRouter } from "next/router";

type Notification = {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  metadata?: {
    shareUrl?: string;
    lessonId?: string;
    sharedBy?: string;
    sharedByName?: string;
  };
};

export function NotificationBell({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const router = useRouter();

  useEffect(() => {
    fetchNotifications();
  }, [userId]);

  async function fetchNotifications() {
    try {
      const res = await fetch(`/api/notifications?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
        setUnreadCount(data.filter((n: Notification) => !n.read).length);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  }

  async function markAsRead(id: string) {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      fetchNotifications();
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  }

  function handleNotificationClick(notif: Notification) {
    console.log('Notification clicked:', notif);
    
    // Mark as read if unread
    if (!notif.read) {
      markAsRead(notif.id);
    }

    // If it's a lesson share notification, redirect to the lesson page
    if (notif.type === 'lesson_share' && notif.metadata?.shareUrl) {
      setShowDropdown(false);
      // Extract the path from the full URL if needed
      const url = notif.metadata.shareUrl;
      const path = url.startsWith('http') ? new URL(url).pathname : url;
      console.log('Redirecting to:', path);
      router.push(path);
    } else {
      console.log('Not a lesson_share notification or missing shareUrl');
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        style={{
          position: 'relative',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontSize: 20,
          padding: 8
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: 4,
            right: 4,
            background: '#ef4444',
            color: 'white',
            borderRadius: '50%',
            width: 18,
            height: 18,
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 600
          }}>
            {unreadCount}
          </span>
        )}
      </button>
      {showDropdown && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          width: 350,
          maxHeight: 400,
          overflowY: 'auto',
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
          zIndex: 1000,
          marginTop: 8
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>
            Notifications
          </div>
          {notifications.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
              No notifications
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #f3f4f6',
                  cursor: 'pointer',
                  background: notif.read ? 'white' : '#fef3c7',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = notif.read ? '#f9fafb' : '#fde68a';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = notif.read ? 'white' : '#fef3c7';
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                  {notif.title}
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                  {notif.message}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>
                  {new Date(notif.createdAt).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
