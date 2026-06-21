import { useState, ChangeEvent, useRef, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";

type AiMessage = {
  id: number;
  role: "user" | "ai";
  text: string;
  attachments?: Array<{
    type: 'image' | 'video' | 'document';
    name: string;
    url: string;
  }>;
};

type ChatHistory = {
  chatId: string;
  title: string;
  messages: AiMessage[];
  createdAt: Date;
  updatedAt: Date;
};

export function AiChatPanel() {
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [nextId, setNextId] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Array<{
    type: 'image' | 'video' | 'document';
    name: string;
    url: string;
  }>>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string>(`chat-${Date.now()}`);
  const [showHistory, setShowHistory] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (user?.id) {
      loadChatHistory();
    }
  }, [user?.id]);

  useEffect(() => {
    if (messages.length > 0 && user?.id) {
      saveChatHistory();
    }
  }, [messages]);

  // Auto-save on page close/refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (messages.length > 0 && user?.id) {
        // Use sendBeacon for reliable save on page unload
        const data = JSON.stringify({
          userId: user.id,
          chatId: currentChatId,
          title: messages[0]?.text.substring(0, 50) || "New Chat",
          messages
        });
        navigator.sendBeacon('/api/chat-history', data);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [messages, user?.id, currentChatId]);

  async function loadChatHistory() {
    try {
      const res = await fetch(`/api/chat-history?userId=${user?.id}`);
      if (res.ok) {
        const data = await res.json();
        console.log("Loaded chat history:", data.length, "chats");
        setChatHistory(data);
        
        // Load the most recent chat automatically (like ChatGPT)
        if (data.length > 0 && messages.length === 0) {
          const mostRecentChat = data[0];
          setMessages(mostRecentChat.messages);
          setCurrentChatId(mostRecentChat.chatId);
          setNextId(Math.max(...mostRecentChat.messages.map((m: AiMessage) => m.id), 0) + 1);
        }
      } else {
        console.error("Failed to load chat history:", await res.text());
      }
    } catch (error) {
      console.error("Failed to load chat history:", error);
    }
  }

  async function saveChatHistory() {
    if (!user?.id || messages.length === 0) return;

    // Generate smart title using AI (like ChatGPT)
    let title = "New Chat";
    
    if (messages.length >= 2) {
      try {
        const titleResponse = await fetch("/api/generate-chat-title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstMessage: messages[0]?.text,
            secondMessage: messages[1]?.text
          })
        });
        
        if (titleResponse.ok) {
          const titleData = await titleResponse.json();
          title = titleData.title;
        } else {
          // Fallback to first message
          title = messages[0]?.text.substring(0, 50) || "New Chat";
        }
      } catch (error) {
        console.error("Failed to generate title:", error);
        title = messages[0]?.text.substring(0, 50) || "New Chat";
      }
    } else {
      title = messages[0]?.text.substring(0, 50) || "New Chat";
    }
    
    try {
      const response = await fetch("/api/chat-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          chatId: currentChatId,
          title,
          messages
        })
      });
      
      if (response.ok) {
        console.log("Chat saved successfully");
        loadChatHistory();
      } else {
        console.error("Failed to save chat:", await response.text());
      }
    } catch (error) {
      console.error("Failed to save chat history:", error);
    }
  }

  async function deleteChat(chatId: string) {
    try {
      await fetch("/api/chat-history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, userId: user?.id })
      });
      loadChatHistory();
      if (chatId === currentChatId) {
        startNewChat();
      }
    } catch (error) {
      console.error("Failed to delete chat:", error);
    }
  }

  function loadChat(chat: ChatHistory) {
    setMessages(chat.messages);
    setCurrentChatId(chat.chatId);
    setNextId(Math.max(...chat.messages.map(m => m.id), 0) + 1);
  }

  function startNewChat() {
    setMessages([]);
    setCurrentChatId(`chat-${Date.now()}`);
    setNextId(1);
    setAttachments([]);
  }

  function pushMessage(role: AiMessage["role"], text: string, attachments?: AiMessage["attachments"]) {
    setMessages((prev) => [...prev, { id: nextId, role, text, attachments }]);
    setNextId((id) => id + 1);
  }

  function handleInputChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setInput(event.target.value);
  }

  function handleFileSelect(type: 'image' | 'video' | 'document') {
    if (type === 'image') {
      imageInputRef.current?.click();
    } else if (type === 'video') {
      videoInputRef.current?.click();
    } else {
      documentInputRef.current?.click();
    }
    setShowAttachMenu(false);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>, type: 'image' | 'video' | 'document') {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setAttachments(prev => [...prev, {
        type,
        name: file.name,
        url: reader.result as string
      }]);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  function removeAttachment(index: number) {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSend() {
    const text = input.trim();
    if ((!text && attachments.length === 0) || isLoading) {
      return;
    }
    
    const messageText = text || "Sent attachments";
    pushMessage("user", messageText, attachments.length > 0 ? [...attachments] : undefined);
    setInput("");
    setAttachments([]);
    setIsLoading(true);
    
    try {
      const response = await fetch("/api/sales-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: messageText,
          attachments: attachments
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        pushMessage("ai", data.message);
      } else {
        console.error("API Error:", data);
        pushMessage("ai", data.error || "Sorry, I'm having trouble responding right now. Please try again.");
      }
    } catch (error) {
      console.error("Network Error:", error);
      pushMessage("ai", "Sorry, I'm having trouble responding right now. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  return (
    <div style={{
      height: 'calc(100vh - 60px)',
      display: 'flex',
      backgroundColor: '#ffffff',
      maxWidth: '100%',
      margin: '0 auto'
    }}>
      {/* Chat History Sidebar */}
      <div style={{
        width: showHistory ? '280px' : '0',
        borderRight: showHistory ? '1px solid #e5e7eb' : 'none',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#f9fafb',
        transition: 'width 0.3s',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '16px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Chat History</h3>
          <button
            onClick={startNewChat}
            style={{
              padding: '6px 12px',
              backgroundColor: '#1f2937',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500
            }}
          >
            + New
          </button>
        </div>
        
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px'
        }}>
          {chatHistory.map((chat) => (
            <div
              key={chat.chatId}
              style={{
                padding: '10px',
                marginBottom: '6px',
                backgroundColor: chat.chatId === currentChatId ? '#ffffff' : 'transparent',
                borderRadius: '8px',
                cursor: 'pointer',
                border: chat.chatId === currentChatId ? '1px solid #1f2937' : '1px solid transparent',
                transition: 'all 0.2s',
                position: 'relative',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '8px'
              }}
              onClick={() => loadChat(chat)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#1f2937',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {chat.title}
                </div>
                <div style={{
                  fontSize: '11px',
                  color: '#6b7280',
                  marginTop: '2px'
                }}>
                  {chat.messages.length} messages
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteChat(chat.chatId);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ef4444',
                  cursor: 'pointer',
                  fontSize: '18px',
                  padding: '0 4px',
                  flexShrink: 0
                }}
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Toggle History Button */}
        <div style={{
          padding: '12px 24px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <button
            onClick={() => setShowHistory(!showHistory)}
            style={{
              background: 'none',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {showHistory ? '◀' : '▶'} {showHistory ? 'Hide' : 'Show'} History
          </button>
        </div>

        {/* Messages Area */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          maxWidth: '800px',
          margin: '0 auto',
          width: '100%'
        }}>
        {messages.length === 0 ? (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
            color: '#6b7280'
          }}>
            <div style={{
              width: '120px',
              height: '120px',
              borderRadius: '30px',
              backgroundColor: '#f3f4f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '24px',
              fontSize: '48px'
            }}>
              🤖
            </div>
            <div style={{fontSize: '32px', fontWeight: 600, marginBottom: '16px', color: '#1f2937'}}>
              How can I help you today?
            </div>
            <div style={{fontSize: '16px', maxWidth: '600px', lineHeight: '1.6', color: '#6b7280'}}>
              Your intelligent co-pilot for strategy, content, and growth.<br />
              Ask anything or use a tool to get started.
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                style={{
                  display: 'flex',
                  justifyContent: message.role === "user" ? 'flex-end' : 'flex-start',
                  marginBottom: '16px'
                }}
              >
                <div
                  style={{
                    maxWidth: '65%',
                    padding: '12px 16px',
                    borderRadius: '18px',
                    backgroundColor: message.role === "user" ? '#1f2937' : '#f3f4f6',
                    color: message.role === "user" ? '#ffffff' : '#1f2937',
                    wordWrap: 'break-word',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    fontSize: '15px',
                    lineHeight: '1.5'
                  }}
                >
                  {message.attachments && message.attachments.length > 0 && (
                    <div style={{ marginBottom: '8px' }}>
                      {message.attachments.map((att, idx) => (
                        <div key={idx} style={{ marginBottom: '8px' }}>
                          {att.type === 'image' && (
                            <img 
                              src={att.url} 
                              alt={att.name}
                              style={{ 
                                maxWidth: '100%', 
                                borderRadius: '8px',
                                display: 'block'
                              }} 
                            />
                          )}
                          {att.type === 'video' && (
                            <video 
                              src={att.url} 
                              controls
                              style={{ 
                                maxWidth: '100%', 
                                borderRadius: '8px',
                                display: 'block'
                              }} 
                            />
                          )}
                          {att.type === 'document' && (
                            <div style={{
                              padding: '8px 12px',
                              backgroundColor: message.role === "user" ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.05)',
                              borderRadius: '8px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}>
                              <span>📄</span>
                              <span style={{ fontSize: '13px' }}>{att.name}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {message.text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div style={{
                display: 'flex',
                justifyContent: 'flex-start',
                marginBottom: '16px'
              }}>
                <div style={{
                  padding: '12px 16px',
                  borderRadius: '18px',
                  backgroundColor: '#f3f4f6',
                  color: '#6b7280',
                  fontSize: '15px'
                }}>
                  Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div style={{
        borderTop: '1px solid #e5e7eb',
        padding: '16px 24px',
        backgroundColor: '#ffffff'
      }}>
        {/* Attachments Preview */}
        {attachments.length > 0 && (
          <div style={{
            maxWidth: '800px',
            margin: '0 auto 12px',
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
            width: '100%'
          }}>
            {attachments.map((att, idx) => (
              <div key={idx} style={{
                position: 'relative',
                padding: '8px 12px',
                backgroundColor: '#f3f4f6',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px'
              }}>
                <span>
                  {att.type === 'image' && '🖼️'}
                  {att.type === 'video' && '🎥'}
                  {att.type === 'document' && '📄'}
                </span>
                <span style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {att.name}
                </span>
                <button
                  onClick={() => removeAttachment(idx)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0 4px',
                    fontSize: '16px',
                    color: '#6b7280'
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div style={{
          maxWidth: '800px',
          margin: '0 auto',
          width: '100%',
          display: 'flex',
          alignItems: 'flex-end',
          gap: '12px',
          backgroundColor: '#f9fafb',
          borderRadius: '24px',
          padding: '8px 16px',
          border: '1px solid #e5e7eb'
        }}>
          {/* Attachment Button */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              disabled={isLoading}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                border: 'none',
                backgroundColor: 'transparent',
                color: '#6b7280',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                transition: 'all 0.2s',
                flexShrink: 0
              }}
            >
              📎
            </button>
            
            {showAttachMenu && (
              <div style={{
                position: 'absolute',
                bottom: '100%',
                left: '0',
                marginBottom: '8px',
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                zIndex: 10,
                minWidth: '160px'
              }}>
                <button 
                  onClick={() => handleFileSelect('image')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '10px 12px',
                    border: 'none',
                    background: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    fontSize: '14px',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <span>🖼️</span>
                  <span>Image</span>
                </button>
                <button 
                  onClick={() => handleFileSelect('video')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '10px 12px',
                    border: 'none',
                    background: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    fontSize: '14px',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <span>🎥</span>
                  <span>Video</span>
                </button>
                <button 
                  onClick={() => handleFileSelect('document')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '10px 12px',
                    border: 'none',
                    background: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    fontSize: '14px',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <span>📄</span>
                  <span>Document</span>
                </button>
              </div>
            )}
          </div>

          <textarea
            placeholder="Message AI... (Shift+Enter for new line)"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontSize: '15px',
              lineHeight: '24px',
              padding: '8px 0',
              backgroundColor: 'transparent',
              minHeight: '24px',
              maxHeight: '120px',
              fontFamily: 'inherit'
            }}
            rows={1}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={((!input.trim() && attachments.length === 0) || isLoading)}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              border: 'none',
              backgroundColor: (input.trim() || attachments.length > 0) && !isLoading ? '#1f2937' : '#d1d5db',
              color: '#ffffff',
              cursor: (input.trim() || attachments.length > 0) && !isLoading ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              transition: 'all 0.2s',
              flexShrink: 0
            }}
          >
            ➤
          </button>
        </div>
        
        {/* Hidden File Inputs */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => handleFileChange(e, 'image')}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          style={{ display: 'none' }}
          onChange={(e) => handleFileChange(e, 'video')}
        />
        <input
          ref={documentInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.rtf"
          style={{ display: 'none' }}
          onChange={(e) => handleFileChange(e, 'document')}
        />
      </div>
    </div>
    </div>
  );
}
