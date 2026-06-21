import { useState, useEffect } from "react";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type ChatHistory = {
  chatId: string;
  title: string;
  messages: Array<{ id: number; role: string; text: string }>;
  updatedAt: Date;
};

type LessonChatHistory = {
  chatId: string;
  lessonTitle: string;
  title: string;
  messages: Array<{ role: string; content: string }>;
  updatedAt: Date;
};

export function ChatHistoryViewer() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [aiChats, setAiChats] = useState<ChatHistory[]>([]);
  const [lessonChats, setLessonChats] = useState<LessonChatHistory[]>([]);
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [chatType, setChatType] = useState<'ai' | 'lesson' | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [chatTypeFilter, setChatTypeFilter] = useState<string>("all");

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.filter((u: User) => u.role !== 'admin'));
      }
    } catch (error) {
      console.error("Failed to load users:", error);
    }
  }

  async function loadUserChats(user: User) {
    setSelectedUser(user);
    setLoading(true);
    
    try {
      const aiRes = await fetch(`/api/chat-history?userId=${user.id}`);
      if (aiRes.ok) {
        setAiChats(await aiRes.json());
      }

      const lessonRes = await fetch(`/api/admin/lesson-chats?userId=${user.id}`);
      if (lessonRes.ok) {
        setLessonChats(await lessonRes.json());
      }
    } catch (error) {
      console.error("Failed to load chats:", error);
    } finally {
      setLoading(false);
    }
  }

  function viewChat(chat: any, type: 'ai' | 'lesson') {
    setSelectedChat(chat);
    setChatType(type);
  }

  function backToChats() {
    setSelectedChat(null);
    setChatType(null);
  }

  function backToUsers() {
    setSelectedUser(null);
    setSelectedChat(null);
    setChatType(null);
    setAiChats([]);
    setLessonChats([]);
  }

  if (selectedChat && chatType) {
    const messages = chatType === 'ai' ? selectedChat.messages : selectedChat.messages;
    
    return (
      <div className="chat-history-viewer">
        <div className="panel-header">
          <div className="panel-header-row">
            <button 
              type="button" 
              className="btn-ghost btn-small"
              onClick={backToChats}
              style={{ marginRight: '12px' }}
            >
              ← Back
            </button>
            <span>{selectedChat.title}</span>
          </div>
        </div>
        <div className="panel-body" style={{ maxWidth: '800px', margin: '0 auto' }}>
          {messages.map((msg: any, idx: number) => {
            const role = chatType === 'ai' ? msg.role : msg.role;
            const content = chatType === 'ai' ? msg.text : msg.content;
            
            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: role === 'user' ? 'flex-end' : 'flex-start',
                  marginBottom: '16px'
                }}
              >
                <div
                  style={{
                    maxWidth: '70%',
                    padding: '12px 16px',
                    borderRadius: '18px',
                    backgroundColor: role === 'user' ? '#1f2937' : '#f3f4f6',
                    color: role === 'user' ? '#ffffff' : '#1f2937',
                    fontSize: '15px',
                    lineHeight: '1.5'
                  }}
                >
                  {content}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (selectedUser) {
    const filteredAiChats = aiChats.filter(chat => {
      const matchesSearch = chat.title.toLowerCase().includes(chatSearchQuery.toLowerCase());
      const matchesDate = !dateFilter || new Date(chat.updatedAt).toISOString().split('T')[0] === dateFilter;
      const matchesType = chatTypeFilter === 'all' || chatTypeFilter === 'ai';
      return matchesSearch && matchesDate && matchesType;
    });

    const filteredLessonChats = lessonChats.filter(chat => {
      const matchesSearch = chat.title.toLowerCase().includes(chatSearchQuery.toLowerCase()) ||
                           chat.lessonTitle.toLowerCase().includes(chatSearchQuery.toLowerCase());
      const matchesDate = !dateFilter || new Date(chat.updatedAt).toISOString().split('T')[0] === dateFilter;
      const matchesType = chatTypeFilter === 'all' || chatTypeFilter === 'lesson';
      return matchesSearch && matchesDate && matchesType;
    });

    return (
      <div className="chat-history-viewer">
        <div className="panel-header">
          <div className="panel-header-row">
            <button 
              type="button" 
              className="btn-ghost btn-small"
              onClick={backToUsers}
              style={{ marginRight: '12px' }}
            >
              ← Back to Users
            </button>
            <span>Chat History - {selectedUser.name} ({selectedUser.role})</span>
          </div>
        </div>
        
        {loading ? (
          <div className="panel-body" style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ fontSize: '16px', color: '#6b7280' }}>Loading chats...</div>
          </div>
        ) : (
          <div className="panel-body" style={{ padding: '24px' }}>
            <div style={{
              maxWidth: '1400px',
              margin: '0 auto 24px',
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              flexWrap: 'wrap'
            }}>
              <div style={{ flex: 1, minWidth: '250px', position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Search chats by title..."
                  value={chatSearchQuery}
                  onChange={(e) => setChatSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px 12px 40px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '10px',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
                <span style={{
                  position: 'absolute',
                  left: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '18px'
                }}>
                  🔍
                </span>
              </div>

              <select
                value={chatTypeFilter}
                onChange={(e) => setChatTypeFilter(e.target.value)}
                style={{
                  padding: '12px 16px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  fontSize: '14px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  minWidth: '180px'
                }}
              >
                <option value="all">All Chat Types</option>
                <option value="ai">AI Chat Only</option>
                <option value="lesson">Course Training Only</option>
              </select>

              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                style={{
                  padding: '12px 16px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  fontSize: '14px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  minWidth: '160px'
                }}
              />

              {(chatSearchQuery || dateFilter || chatTypeFilter !== 'all') && (
                <button
                  onClick={() => {
                    setChatSearchQuery('');
                    setDateFilter('');
                    setChatTypeFilter('all');
                  }}
                  style={{
                    padding: '12px 16px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '10px',
                    fontSize: '14px',
                    backgroundColor: '#f3f4f6',
                    cursor: 'pointer',
                    fontWeight: 500
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>

            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: (chatTypeFilter === 'all') ? '1fr 1fr' : '1fr',
              gap: '24px',
              maxWidth: '1400px',
              margin: '0 auto'
            }}>
              {(chatTypeFilter === 'all' || chatTypeFilter === 'ai') && (
                <div style={{
                  backgroundColor: '#f9fafb',
                  borderRadius: '12px',
                  padding: '20px',
                  border: '1px solid #e5e7eb'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '20px',
                    paddingBottom: '12px',
                    borderBottom: '2px solid #1f2937'
                  }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#1f2937' }}>
                      💬 AI Chat History
                    </h3>
                    <span style={{
                      backgroundColor: '#1f2937',
                      color: 'white',
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '13px',
                      fontWeight: 600
                    }}>
                      {filteredAiChats.length}
                    </span>
                  </div>
                  
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '12px',
                    maxHeight: 'calc(100vh - 400px)',
                    overflowY: 'auto',
                    paddingRight: '8px'
                  }}>
                    {filteredAiChats.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af', fontSize: '14px' }}>
                        <div style={{ fontSize: '48px', marginBottom: '12px' }}>💭</div>
                        {chatSearchQuery || dateFilter ? 'No matching AI chats' : 'No AI chats yet'}
                      </div>
                    ) : (
                      filteredAiChats.map((chat) => (
                        <div
                          key={chat.chatId}
                          onClick={() => viewChat(chat, 'ai')}
                          style={{
                            padding: '16px',
                            backgroundColor: '#ffffff',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            border: '1px solid #e5e7eb',
                            transition: 'all 0.2s',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                          }}
                        >
                          <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '8px', color: '#1f2937' }}>
                            {chat.title}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>💬 {chat.messages.length} messages</span>
                            <span>•</span>
                            <span>📅 {new Date(chat.updatedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {(chatTypeFilter === 'all' || chatTypeFilter === 'lesson') && (
                <div style={{
                  backgroundColor: '#f9fafb',
                  borderRadius: '12px',
                  padding: '20px',
                  border: '1px solid #e5e7eb'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '20px',
                    paddingBottom: '12px',
                    borderBottom: '2px solid #1f2937'
                  }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#1f2937' }}>
                      📚 Course Training Chats
                    </h3>
                    <span style={{
                      backgroundColor: '#1f2937',
                      color: 'white',
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '13px',
                      fontWeight: 600
                    }}>
                      {filteredLessonChats.length}
                    </span>
                  </div>
                  
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '12px',
                    maxHeight: 'calc(100vh - 400px)',
                    overflowY: 'auto',
                    paddingRight: '8px'
                  }}>
                    {filteredLessonChats.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af', fontSize: '14px' }}>
                        <div style={{ fontSize: '48px', marginBottom: '12px' }}>📖</div>
                        {chatSearchQuery || dateFilter ? 'No matching lesson chats' : 'No lesson chats yet'}
                      </div>
                    ) : (
                      filteredLessonChats.map((chat) => (
                        <div
                          key={chat.chatId}
                          onClick={() => viewChat(chat, 'lesson')}
                          style={{
                            padding: '16px',
                            backgroundColor: '#ffffff',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            border: '1px solid #e5e7eb',
                            transition: 'all 0.2s',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                          }}
                        >
                          <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '8px', color: '#1f2937' }}>
                            {chat.title}
                          </div>
                          <div style={{
                            fontSize: '11px',
                            color: '#6b7280',
                            backgroundColor: '#f3f4f6',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            marginBottom: '8px',
                            display: 'inline-block'
                          }}>
                            📖 {chat.lessonTitle}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>💬 {chat.messages.length} messages</span>
                            <span>•</span>
                            <span>📅 {new Date(chat.updatedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="chat-history-viewer">
      <div className="panel-header">
        <div className="panel-header-row">
          <span>Team Chat History</span>
        </div>
      </div>
      <div className="panel-body" style={{ padding: '24px' }}>
        <div style={{ 
          maxWidth: '800px', 
          margin: '0 auto 24px',
          display: 'flex',
          gap: '12px',
          alignItems: 'center'
        }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px 12px 40px',
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                fontSize: '14px',
                outline: 'none'
              }}
            />
            <span style={{
              position: 'absolute',
              left: '14px',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '18px'
            }}>
              🔍
            </span>
          </div>
          
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{
              padding: '12px 16px',
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              fontSize: '14px',
              backgroundColor: 'white',
              cursor: 'pointer',
              minWidth: '150px'
            }}
          >
            <option value="all">All Roles</option>
            <option value="manager">Manager</option>
            <option value="sales">Sales</option>
            <option value="marketing">Marketing</option>
          </select>
        </div>

        <div style={{ display: 'grid', gap: '12px', maxWidth: '800px', margin: '0 auto' }}>
          {users
            .filter(user => {
              const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                   user.email.toLowerCase().includes(searchQuery.toLowerCase());
              const matchesRole = roleFilter === 'all' || user.role === roleFilter;
              return matchesSearch && matchesRole;
            })
            .map((user) => (
              <div
                key={user.id}
                onClick={() => loadUserChats(user)}
                style={{
                  padding: '18px',
                  backgroundColor: '#ffffff',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  border: '1px solid #e5e7eb',
                  transition: 'all 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '4px', color: '#1f2937' }}>
                      {user.name}
                    </div>
                    <div style={{ fontSize: '13px', color: '#6b7280' }}>
                      {user.email}
                    </div>
                  </div>
                  <div style={{
                    padding: '6px 14px',
                    backgroundColor: '#1f2937',
                    color: 'white',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 600,
                    textTransform: 'capitalize'
                  }}>
                    {user.role}
                  </div>
                </div>
              </div>
            ))}
          
          {users.filter(user => {
            const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                 user.email.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesRole = roleFilter === 'all' || user.role === roleFilter;
            return matchesSearch && matchesRole;
          }).length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: '#9ca3af'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔍</div>
              <div style={{ fontSize: '16px', fontWeight: 500 }}>No users found</div>
              <div style={{ fontSize: '14px', marginTop: '8px' }}>Try adjusting your search or filter</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
