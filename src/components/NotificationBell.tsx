import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { Toast } from "./Toast";

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

// How often (ms) we re-check the server for newly-arrived notifications.
const POLL_INTERVAL = 20000;

export function NotificationBell({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();

  // Tracks every notification id we've already shown the user, so a poll can
  // tell which notifications are genuinely new (and worth a pop-up).
  const seenIdsRef = useRef<Set<string>>(new Set());
  // Skip the pop-up on the very first load — those aren't "new" to the user.
  const initializedRef = useRef(false);

  useEffect(() => {
    // Reset per-user state when the signed-in user changes.
    seenIdsRef.current = new Set();
    initializedRef.current = false;
    fetchNotifications();

    const interval = setInterval(fetchNotifications, POLL_INTERVAL);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function fetchNotifications() {
    try {
      const res = await fetch(`/api/notifications?userId=${userId}`);
      if (!res.ok) return;
      const data: Notification[] = await res.json();
      setNotifications(data);
      setUnreadCount(data.filter((n) => !n.read).length);

      // Find unread notifications we haven't seen before.
      const freshUnread = data.filter((n) => !n.read && !seenIdsRef.current.has(n.id));

      if (initializedRef.current && freshUnread.length > 0) {
        setToast(
          freshUnread.length === 1
            ? `🔔 New notification: ${freshUnread[0].title} — please check`
            : `🔔 ${freshUnread.length} new notifications received — please check`
        );
      }

      // Remember every id we've now seen (first load included).
      data.forEach((n) => seenIdsRef.current.add(n.id));
      initializedRef.current = true;
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
      {toast && (
        <Toast message={toast} type="info" duration={5000} onClose={() => setToast(null)} />
      )}
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
        <span style={{ display: 'inline-block', animation: unreadCount > 0 ? 'bellSwing 1s ease-in-out infinite' : 'none' }}>
          🔔
        </span>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: 4,
            right: 4,
            background: '#ef4444',
            color: 'white',
            borderRadius: '50%',
            minWidth: 18,
            height: 18,
            padding: '0 4px',
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 600,
            boxShadow: '0 0 0 0 rgba(239,68,68,0.6)',
            animation: 'badgePulse 1.5s ease-out infinite'
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      <style jsx>{`
        @keyframes bellSwing {
          0%, 100% { transform: rotate(0deg); }
          20% { transform: rotate(15deg); }
          40% { transform: rotate(-12deg); }
          60% { transform: rotate(8deg); }
          80% { transform: rotate(-5deg); }
        }
        @keyframes badgePulse {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6); }
          70% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
      `}</style>
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
