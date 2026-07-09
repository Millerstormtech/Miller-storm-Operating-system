import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../contexts/AuthContext";

type ChatMessage = {
  _id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  message: string;
  messageType: 'text' | 'image' | 'video' | 'file';
  mediaUrl?: string;
  replyTo?: string;
  replyToMessage?: string;
  replyToSender?: string;
  createdAt: Date;
};

type ChatGroup = {
  _id: string;
  name: string;
  description: string;
  imageUrl: string;
  members: string[];
  admins: string[];
  onlyAdminCanChat: boolean;
  isDirect?: boolean;
};

type Props = {
  group: ChatGroup;
  onBack: () => void;
  // Optional membership hint from the caller. The web auth user carries only the
  // app id (not the Mongo _id that group.members stores), so a sales/manager
  // member can't be matched client-side; the sales/manager StormChat list is
  // already server-filtered to the user's own groups, so it passes isMember.
  isMember?: boolean;
  // Header label override (a DM has no name — show the other person's name).
  title?: string;
  // When provided (in a group), each other member's message shows a "Message
  // privately" action that starts a 1-on-1 DM with that sender.
  onMessagePrivately?: (userId: string, name: string) => void;
};

export function StormChatRoom({ group, onBack, isMember, title, onMessagePrivately }: Props) {
  const { user } = useAuth();
  const isDirect = !!group.isDirect;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [blinkingMessageId, setBlinkingMessageId] = useState<string | null>(null);
  const messageRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [menuMessageId, setMenuMessageId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);

  // Check if user can send messages
  const isGroupMember = isMember || group.members.includes(user?._id || user?.id || '');
  const isAdmin = user?.role === 'admin';
  const isGroupAdmin = group.admins.includes(user?._id || user?.id || '');
  
  const canSendMessage = isAdmin || isGroupAdmin || (group.onlyAdminCanChat ? false : isGroupMember);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000); // Poll every 3 seconds
    return () => clearInterval(interval);
  }, [group._id]);

  useEffect(() => {
    if (shouldAutoScroll) {
      scrollToBottom();
    }
  }, [messages, shouldAutoScroll]);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function scrollToMessage(messageId: string) {
    const messageElement = messageRefs.current[messageId];
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Start blinking
      setBlinkingMessageId(messageId);
      
      // Stop blinking after 1 second (2 blinks)
      setTimeout(() => {
        setBlinkingMessageId(null);
      }, 1000);
    }
  }

  function handleScroll() {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setShouldAutoScroll(isAtBottom);
    }
  }

  async function fetchMessages() {
    try {
      const userId = user?._id || user?.id;
      const userRole = user?.role;
      const response = await fetch(`/api/storm-chat/messages/${group._id}?userId=${userId}&userRole=${userRole}`);
      if (response.ok) {
        const data = await response.json();
        if (data.length > messages.length) {
          console.log(`[STORM-CHAT] 📥 Received ${data.length - messages.length} new messages`);
        }
        setMessages(data);
      } else {
        const error = await response.json();
        console.error(`[STORM-CHAT] ❌ Failed to fetch messages:`, error);
        alert(error.error || 'Failed to fetch messages');
      }
    } catch (error) {
      console.error('[STORM-CHAT] ❌ Error in fetchMessages:', error);
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage() {
    if (!newMessage.trim() || sending) return;

    console.log(`[STORM-CHAT] 📤 Sending message to group: ${group.name} (${group._id})`);
    console.log(`[STORM-CHAT] Message content: "${newMessage}"`);

    setSending(true);
    try {
      const messageBody: any = {
        senderId: user?._id || user?.id,
        senderName: user?.name,
        senderRole: user?.role,
        message: newMessage,
        messageType: 'text'
      };

      // Add reply data if replying
      if (replyingTo) {
        console.log(`[STORM-CHAT] Replying to message ID: ${replyingTo._id}`);
        messageBody.replyTo = replyingTo._id;
        messageBody.replyToMessage = replyingTo.message;
        messageBody.replyToSender = replyingTo.senderName;
      }

      const response = await fetch(`/api/storm-chat/messages/${group._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messageBody)
      });

      if (response.ok) {
        const message = await response.json();
        console.log(`[STORM-CHAT] ✅ Message sent successfully! Message ID: ${message._id}`);
        
        // Log push notification status
        if (message.pushStatus) {
          const { mentionCount, memberCount, error } = message.pushStatus;
          if (error) {
            console.error(`[STORM-CHAT] ⚠️ Push notification error: ${error}`);
          } else {
            console.log(`[STORM-CHAT] 📱 Push notifications: ${mentionCount} mentions, ${memberCount} members notified`);
          }
        }

        setMessages([...messages, message]);
        setNewMessage("");
        setReplyingTo(null);
        setShouldAutoScroll(true);
      } else {
        const error = await response.json();
        console.error(`[STORM-CHAT] ❌ Failed to send message:`, error);
        alert(error.error || 'Failed to send message');
      }
    } catch (error) {
      console.error('[STORM-CHAT] ❌ Error in sendMessage:', error);
      alert('Failed to send message');
    } finally {
      setSending(false);
    }
  }

  async function handleFileUpload(file: File) {
    console.log(`[STORM-CHAT] 📁 Starting file upload: ${file.name} (${file.type})`);
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const uploadResponse = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData
      });

      if (!uploadResponse.ok) {
        console.error(`[STORM-CHAT] ❌ File upload failed`);
        alert('Failed to upload file');
        return;
      }

      const { url } = await uploadResponse.json();
      console.log(`[STORM-CHAT] ✅ File uploaded successfully! URL: ${url}`);
      
      // Determine message type
      let messageType: 'image' | 'video' | 'file' = 'file';
      if (file.type.startsWith('image/')) messageType = 'image';
      else if (file.type.startsWith('video/')) messageType = 'video';

      console.log(`[STORM-CHAT] 📤 Sending media message...`);
      // Send message with media
      const response = await fetch(`/api/storm-chat/messages/${group._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: user?._id || user?.id,
          senderName: user?.name,
          senderRole: user?.role,
          message: file.name,
          messageType,
          mediaUrl: url
        })
      });

      if (response.ok) {
        const message = await response.json();
        console.log(`[STORM-CHAT] ✅ Media message sent successfully! Message ID: ${message._id}`);
        
        // Log push notification status
        if (message.pushStatus) {
          const { mentionCount, memberCount, error } = message.pushStatus;
          if (error) {
            console.error(`[STORM-CHAT] ⚠️ Push notification error: ${error}`);
          } else {
            console.log(`[STORM-CHAT] 📱 Push notifications: ${mentionCount} mentions, ${memberCount} members notified`);
          }
        }

        setMessages([...messages, message]);
      } else {
        const error = await response.json();
        console.error(`[STORM-CHAT] ❌ Failed to send media message:`, error);
        alert('Failed to send file');
      }
    } catch (error) {
      console.error('[STORM-CHAT] ❌ Error in handleFileUpload:', error);
      alert('Failed to upload file');
    } finally {
      setUploading(false);
    }
  }

  function formatTime(date: Date) {
    // Convert UTC to CT (UTC-5:00 for CDT - Central Daylight Time)
    const d = new Date(date);
    const utcTime = d.getTime();
    const ctTime = new Date(utcTime - (5 * 60 * 60 * 1000));
    const hours = ctTime.getHours().toString().padStart(2, '0');
    const minutes = ctTime.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  function formatDate(date: Date) {
    // Convert UTC to CT (UTC-5:00 for CDT - Central Daylight Time)
    const d = new Date(date);
    const utcTime = d.getTime();
    const ctDate = new Date(utcTime - (5 * 60 * 60 * 1000));
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (ctDate.toDateString() === today.toDateString()) return 'Today';
    if (ctDate.toDateString() === yesterday.toDateString()) return 'Yesterday';
    
    return ctDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function renderTextWithLinks(text: string, textColor: string) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    
    return parts.map((part, index) => {
      if (urlRegex.test(part)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: textColor === '#fff' ? '#93c5fd' : '#2563eb',
              textDecoration: 'underline',
              cursor: 'pointer'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }
      return part;
    });
  }

  function renderMessage(msg: ChatMessage, index: number) {
    const isMyMessage = msg.senderId === (user?._id || user?.id);
    const showDate = index === 0 || 
      new Date(messages[index - 1].createdAt).toDateString() !== new Date(msg.createdAt).toDateString();
    const isBlinking = blinkingMessageId === msg._id;
    const isHovered = hoveredMessageId === msg._id;
    const showMenu = menuMessageId === msg._id;

    return (
      <div key={msg._id} ref={(el) => { messageRefs.current[msg._id] = el; }}>
        {showDate && (
          <div style={{ 
            textAlign: 'center', 
            margin: '16px 0',
            fontSize: 12,
            color: '#6b7280'
          }}>
            <span style={{ 
              backgroundColor: '#f3f4f6',
              padding: '4px 12px',
              borderRadius: 12
            }}>
              {formatDate(msg.createdAt)}
            </span>
          </div>
        )}
        
        <div 
          style={{ 
            display: 'flex', 
            justifyContent: isMyMessage ? 'flex-end' : 'flex-start',
            marginBottom: 8,
            transition: 'background-color 0.25s',
            backgroundColor: isBlinking ? 'rgba(250, 204, 21, 0.3)' : 'transparent',
            borderRadius: 16,
            padding: isBlinking ? 4 : 0,
            position: 'relative'
          }}>
          <div style={{ 
            maxWidth: '70%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: isMyMessage ? 'flex-end' : 'flex-start',
            position: 'relative'
          }}>
            {!isMyMessage && (
              <div style={{
                fontSize: 11,
                color: '#6b7280',
                marginBottom: 4,
                marginLeft: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                {msg.senderName}
                {/* Group option 1: message this sender privately */}
                {!isDirect && onMessagePrivately && (
                  <button
                    onClick={() => onMessagePrivately(msg.senderId, msg.senderName)}
                    title={`Message ${msg.senderName} privately`}
                    style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 11, padding: 0, textDecoration: 'underline' }}>
                    Message privately
                  </button>
                )}
              </div>
            )}
            
            {msg.messageType === 'text' && (
              <div 
                onMouseEnter={() => setHoveredMessageId(msg._id)}
                onMouseLeave={() => {
                  setHoveredMessageId(null);
                  if (!showMenu) setMenuMessageId(null);
                }}
                style={{ 
                  backgroundColor: isMyMessage ? '#DC2626' : '#f3f4f6',
                  color: isMyMessage ? '#fff' : '#111827',
                  padding: '10px 14px',
                  borderRadius: 16,
                  borderTopRightRadius: isMyMessage ? 4 : 16,
                  borderTopLeftRadius: isMyMessage ? 16 : 4,
                  wordBreak: 'break-word',
                  position: 'relative'
                }}>
                {/* Menu button on hover */}
                {isHovered && (
                  <button
                    onClick={() => setMenuMessageId(showMenu ? null : msg._id)}
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      background: 'none',
                      border: 'none',
                      color: isMyMessage ? '#fff' : '#6b7280',
                      cursor: 'pointer',
                      padding: 4,
                      fontSize: 18,
                      lineHeight: 1,
                      fontWeight: 'bold',
                      letterSpacing: '2px'
                    }}
                  >
                    ⋯
                  </button>
                )}
                
                {/* Popup menu */}
                {showMenu && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 28,
                      ...(isMyMessage ? { right: '100%', marginRight: 8 } : { left: '100%', marginLeft: 8 }),
                      backgroundColor: '#1f2937',
                      borderRadius: 8,
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                      zIndex: 1000,
                      minWidth: 150,
                      overflow: 'hidden'
                    }}
                  >
                    <button
                      onClick={() => {
                        setReplyingTo(msg);
                        setMenuMessageId(null);
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        background: 'none',
                        border: 'none',
                        color: '#fff',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: 14,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#374151'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      ↩ Reply
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(msg.message);
                        setMenuMessageId(null);
                        alert('Message copied!');
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        background: 'none',
                        border: 'none',
                        color: '#fff',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: 14,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#374151'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      📋 Copy
                    </button>
                  </div>
                )}
                
                {/* Reply preview */}
                {msg.replyTo && msg.replyToMessage && (
                  <div 
                    onClick={() => scrollToMessage(msg.replyTo!)}
                    style={{
                      marginBottom: 6,
                      padding: 8,
                      backgroundColor: isMyMessage ? 'rgba(255, 255, 255, 0.2)' : '#fff',
                      borderRadius: 8,
                      borderLeft: `3px solid ${isMyMessage ? '#fff' : '#DC2626'}`,
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: isMyMessage ? '#fff' : '#DC2626',
                      marginBottom: 2
                    }}>
                      {msg.replyToSender || 'Unknown'}
                    </div>
                    <div style={{
                      fontSize: 12,
                      color: isMyMessage ? 'rgba(255, 255, 255, 0.8)' : '#6b7280',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {msg.replyToMessage}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <div style={{ fontSize: 14, flex: 1 }}>
                    {renderTextWithLinks(msg.message, isMyMessage ? '#fff' : '#111827')}
                  </div>
                  <div style={{ 
                    fontSize: 10, 
                    color: isMyMessage ? 'rgba(255, 255, 255, 0.7)' : '#9ca3af',
                    whiteSpace: 'nowrap',
                    alignSelf: 'flex-end'
                  }}>
                    {formatTime(msg.createdAt)}
                  </div>
                </div>
              </div>
            )}
            
            {msg.messageType === 'image' && msg.mediaUrl && (
              <div 
                onClick={() => window.open(msg.mediaUrl, '_blank')}
                style={{ cursor: 'pointer' }}
              >
                <img 
                  src={msg.mediaUrl} 
                  alt="Image"
                  style={{ 
                    maxWidth: 300,
                    maxHeight: 300,
                    borderRadius: 8,
                    display: 'block'
                  }}
                />
              </div>
            )}
            
            {msg.messageType === 'video' && msg.mediaUrl && (
              <div>
                <video 
                  src={msg.mediaUrl}
                  controls
                  style={{ 
                    maxWidth: 300,
                    maxHeight: 300,
                    borderRadius: 8,
                    display: 'block'
                  }}
                />
              </div>
            )}
            
            {msg.messageType === 'file' && msg.mediaUrl && (
              <div style={{ 
                backgroundColor: isMyMessage ? '#DC2626' : '#f3f4f6',
                color: isMyMessage ? '#fff' : '#111827',
                padding: '10px 14px',
                borderRadius: 16,
                borderTopRightRadius: isMyMessage ? 4 : 16,
                borderTopLeftRadius: isMyMessage ? 16 : 4,
                wordBreak: 'break-word'
              }}>
                <a 
                  href={msg.mediaUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ 
                    color: isMyMessage ? '#fff' : '#DC2626',
                    textDecoration: 'underline',
                    fontSize: 14
                  }}
                >
                  📎 {msg.message}
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: 'calc(100vh - 200px)',
      backgroundColor: '#fff',
      borderRadius: 12,
      overflow: 'hidden',
      border: '1px solid #e5e7eb'
    }}>
      {/* Header */}
      <div style={{ 
        padding: 16,
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        backgroundColor: '#f9fafb'
      }}>
        <button 
          onClick={onBack}
          style={{ 
            background: 'none',
            border: 'none',
            fontSize: 20,
            cursor: 'pointer',
            padding: 4
          }}
        >
          ←
        </button>
        
        <div style={{ 
          width: 40, 
          height: 40, 
          borderRadius: 8,
          backgroundColor: '#000',
          backgroundImage: group.imageUrl ? `url(${group.imageUrl})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          color: '#fff'
        }}>
          {!group.imageUrl && '👥'}
        </div>
        
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>
            {title || group.name}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            {isDirect ? 'Private message' : `${group.members.length} members`}
            {!isDirect && group.onlyAdminCanChat && ' • Admin-only chat'}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        style={{ 
          flex: 1,
          overflowY: 'auto',
          padding: 16,
          backgroundColor: '#fafafa'
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💬</div>
            <div>No messages yet. Start the conversation!</div>
          </div>
        ) : (
          messages.map((msg, index) => renderMessage(msg, index))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ 
        padding: 16,
        borderTop: '1px solid #e5e7eb',
        backgroundColor: '#fff'
      }}>
        {!canSendMessage ? (
          <div style={{ 
            textAlign: 'center',
            padding: 12,
            backgroundColor: '#fef2f2',
            borderRadius: 8,
            color: '#dc2626',
            fontSize: 14
          }}>
            🔒 Only admins can send messages in this group
          </div>
        ) : (
          <div>
            {/* Reply preview */}
            {replyingTo && (
              <div style={{
                marginBottom: 8,
                padding: 8,
                backgroundColor: '#f3f4f6',
                borderRadius: 8,
                borderLeft: '3px solid #DC2626',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#DC2626' }}>
                    {replyingTo.senderName}
                  </div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                    {replyingTo.message}
                  </div>
                </div>
                <button
                  onClick={() => setReplyingTo(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 18,
                    color: '#6b7280',
                    padding: 4
                  }}
                >
                  ✕
                </button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                padding: '10px 12px',
                backgroundColor: '#f3f4f6',
                border: 'none',
                borderRadius: 8,
                cursor: uploading ? 'not-allowed' : 'pointer',
                fontSize: 18
              }}
            >
              {uploading ? '⏳' : '📎'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
            />
            
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Type a message..."
              disabled={sending}
              style={{
                flex: 1,
                padding: '10px 14px',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                fontSize: 14,
                resize: 'none',
                minHeight: 44,
                maxHeight: 120,
                fontFamily: 'inherit'
              }}
              rows={1}
            />
            
            <button
              type="button"
              onClick={sendMessage}
              disabled={!newMessage.trim() || sending}
              style={{
                padding: '10px 16px',
                backgroundColor: newMessage.trim() ? '#DC2626' : '#e5e7eb',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: newMessage.trim() && !sending ? 'pointer' : 'not-allowed',
                fontSize: 18,
                fontWeight: 600
              }}
            >
              {sending ? '⏳' : '➤'}
            </button>
          </div>
          </div>
        )}
      </div>
    </div>
  );
}
