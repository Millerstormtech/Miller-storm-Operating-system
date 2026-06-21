import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { UserProfile } from "../../types";

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

export function TeamMemberDetail(props: {
  member: UserProfile;
  onMemberChange: (member: UserProfile) => void;
}) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<'profile' | 'chats'>('profile');
  const [aiChats, setAiChats] = useState<ChatHistory[]>([]);
  const [lessonChats, setLessonChats] = useState<LessonChatHistory[]>([]);
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [chatType, setChatType] = useState<'ai' | 'lesson' | null>(null);
  const [loadingChats, setLoadingChats] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [chatTypeFilter, setChatTypeFilter] = useState<string>("all");

  useEffect(() => {
    if (viewMode === 'chats') {
      loadUserChats();
    }
  }, [viewMode]);

  async function loadUserChats() {
    setLoadingChats(true);
    try {
      const aiRes = await fetch(`/api/chat-history?userId=${props.member.id}`);
      if (aiRes.ok) {
        setAiChats(await aiRes.json());
      }

      const lessonRes = await fetch(`/api/admin/lesson-chats?userId=${props.member.id}`);
      if (lessonRes.ok) {
        setLessonChats(await lessonRes.json());
      }
    } catch (error) {
      console.error("Failed to load chats:", error);
    } finally {
      setLoadingChats(false);
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

  function backToTeam() {
    router.push('/manager/team');
  }

  // Chat message view
  if (selectedChat && chatType) {
    const messages = selectedChat.messages;
    
    return (
      <div className="admin-user-management">
        <div className="panel panel-right" style={{ width: '100%', maxWidth: '1200px', margin: '0 auto' }}>
          <div className="panel-scroll">
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
        </div>
      </div>
    );
  }

  return (
    <div className="admin-user-management">
      <div className="panel panel-right" style={{ width: '100%', maxWidth: '1200px', margin: '0 auto' }}>
        <div className="panel-scroll">
          <div className="panel-header">
            <div className="panel-header-row">
              <button 
                type="button" 
                className="btn-ghost btn-small"
                onClick={backToTeam}
                style={{ marginRight: '12px' }}
              >
                ← Back to Team
              </button>
              <span>Rep Profile - {props.member.name}</span>
              <div className="panel-header-actions">
                <button 
                  type="button" 
                  className={viewMode === 'profile' ? "btn-primary btn-small" : "btn-secondary btn-small"}
                  onClick={() => setViewMode('profile')}
                >
                  Profile
                </button>
                <button 
                  type="button" 
                  className={viewMode === 'chats' ? "btn-primary btn-small" : "btn-secondary btn-small"}
                  onClick={() => setViewMode('chats')}
                >
                  Chat History
                </button>
              </div>
            </div>
          </div>
          
          {viewMode === 'profile' ? (
            <div className="panel-body">
              <div className="panel-section">
                <div className="panel-section-title">Team Member Info</div>
                <div className="form-grid">
                  <label className="field">
                    <span className="field-label">Name</span>
                    <input
                      className="field-input"
                      value={props.member.name}
                      disabled
                      style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Email</span>
                    <input
                      className="field-input"
                      value={props.member.email}
                      disabled
                      style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Territory</span>
                    <input
                      className="field-input"
                      value={props.member.territory ?? ""}
                      disabled
                      style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
                    />
                  </label>
                </div>
              </div>
              <div className="panel-section">
                <div className="panel-section-title">Strengths & Weaknesses</div>
                <div className="form-grid">
                  <label className="field">
                    <span className="field-label">Strengths / Superpowers</span>
                    <textarea
                      className="field-input"
                      rows={4}
                      value={props.member.strengths}
                      onChange={(e) =>
                        props.onMemberChange({
                          ...props.member,
                          strengths: e.target.value
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Weaknesses / Insecurities</span>
                    <textarea
                      className="field-input"
                      rows={4}
                      value={props.member.weaknesses}
                      onChange={(e) =>
                        props.onMemberChange({
                          ...props.member,
                          weaknesses: e.target.value
                        })
                      }
                    />
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <div className="panel-body" style={{ padding: '24px' }}>
              {loadingChats ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <div style={{ fontSize: '16px', color: '#6b7280' }}>Loading chats...</div>
                </div>
              ) : (
                <>
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

                    {(chatSearchQuery || chatTypeFilter !== 'all') && (
                      <button
                        onClick={() => {
                          setChatSearchQuery('');
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
                            {aiChats.filter(chat => chat.title.toLowerCase().includes(chatSearchQuery.toLowerCase())).length}
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
                          {aiChats.filter(chat => chat.title.toLowerCase().includes(chatSearchQuery.toLowerCase())).length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af', fontSize: '14px' }}>
                              <div style={{ fontSize: '48px', marginBottom: '12px' }}>💭</div>
                              {chatSearchQuery ? 'No matching AI chats' : 'No AI chats yet'}
                            </div>
                          ) : (
                            aiChats.filter(chat => chat.title.toLowerCase().includes(chatSearchQuery.toLowerCase())).map((chat) => (
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
                            {lessonChats.filter(chat => 
                              chat.title.toLowerCase().includes(chatSearchQuery.toLowerCase()) ||
                              chat.lessonTitle.toLowerCase().includes(chatSearchQuery.toLowerCase())
                            ).length}
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
                          {lessonChats.filter(chat => 
                            chat.title.toLowerCase().includes(chatSearchQuery.toLowerCase()) ||
                            chat.lessonTitle.toLowerCase().includes(chatSearchQuery.toLowerCase())
                          ).length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af', fontSize: '14px' }}>
                              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📖</div>
                              {chatSearchQuery ? 'No matching lesson chats' : 'No lesson chats yet'}
                            </div>
                          ) : (
                            lessonChats.filter(chat => 
                              chat.title.toLowerCase().includes(chatSearchQuery.toLowerCase()) ||
                              chat.lessonTitle.toLowerCase().includes(chatSearchQuery.toLowerCase())
                            ).map((chat) => (
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
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
