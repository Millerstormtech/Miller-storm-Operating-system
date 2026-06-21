import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";

export function LessonAIChat(props: { lessonTitle: string; lessonContent?: string; videoUrl?: string; courseTitle?: string; allPages?: any[]; trainingText?: string; hasTraining?: boolean }) {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string>(`lesson-chat-${Date.now()}`);
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (user?.id) {
      loadChatHistory();
    }
  }, [user?.id, props.lessonTitle]);

  useEffect(() => {
    if (messages.length > 0 && user?.id) {
      saveChatHistory();
    }
  }, [messages]);

  async function loadChatHistory() {
    try {
      const res = await fetch(`/api/lesson-chat-history?userId=${user?.id}&lessonTitle=${encodeURIComponent(props.lessonTitle)}`);
      if (res.ok) {
        const data = await res.json();
        setChatHistory(data);
        
        if (data.length > 0 && messages.length === 0) {
          const mostRecentChat = data[0];
          setMessages(mostRecentChat.messages);
          setCurrentChatId(mostRecentChat.chatId);
        }
      }
    } catch (error) {
      console.error("Failed to load chat history:", error);
    }
  }

  async function saveChatHistory() {
    if (!user?.id || messages.length === 0) return;

    let title = "New Chat";
    
    if (messages.length >= 2) {
      try {
        const titleResponse = await fetch("/api/generate-chat-title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstMessage: messages[0]?.content,
            secondMessage: messages[1]?.content
          })
        });
        
        if (titleResponse.ok) {
          const titleData = await titleResponse.json();
          title = titleData.title;
        } else {
          title = messages[0]?.content.substring(0, 50) || "New Chat";
        }
      } catch (error) {
        title = messages[0]?.content.substring(0, 50) || "New Chat";
      }
    } else {
      title = messages[0]?.content.substring(0, 50) || "New Chat";
    }
    
    try {
      await fetch("/api/lesson-chat-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          chatId: currentChatId,
          lessonTitle: props.lessonTitle,
          title,
          messages
        })
      });
      loadChatHistory();
    } catch (error) {
      console.error("Failed to save chat history:", error);
    }
  }

  async function deleteChat(chatId: string) {
    try {
      await fetch("/api/lesson-chat-history", {
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

  function loadChat(chat: any) {
    setMessages(chat.messages);
    setCurrentChatId(chat.chatId);
  }

  function startNewChat() {
    setMessages([]);
    setCurrentChatId(`lesson-chat-${Date.now()}`);
  }

  async function handleSend() {
    if (!message.trim() || isLoading) return;
    
    const userMessage = message.trim();
    setMessage("");
    setMessages([...messages, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content: userMessage }],
          lessonTitle: props.lessonTitle,
          lessonContent: props.lessonContent,
          videoUrl: props.videoUrl,
          courseTitle: props.courseTitle,
          allPages: props.allPages,
          trainingText: props.trainingText,
          hasTraining: props.hasTraining
        })
      });

      if (!response.ok) throw new Error("Failed to get response");

      const data = await response.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.message }]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I couldn't process your request. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div style={{
      width: 320,
      minWidth: 320,
      maxWidth: 320,
      height: "calc(100vh - 150px)",
      minHeight: 500,
      display: "flex",
      flexDirection: "column",
      backgroundColor: "#fff",
      borderLeft: "1px solid #e5e7eb"
    }}>
      <div style={{
        padding: "12px 16px",
        borderBottom: "1px solid #e5e7eb",
        flexShrink: 0,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Lesson AI Coach</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Ask questions about {props.lessonTitle}.</div>
        </div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          style={{
            background: 'none',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            padding: '4px 8px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          {showHistory ? '✕' : '📋'}
        </button>
      </div>

      {showHistory ? (
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px',
          minHeight: 0
        }}>
          <button
            onClick={startNewChat}
            style={{
              width: '100%',
              padding: '8px',
              marginBottom: '8px',
              backgroundColor: '#1f2937',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500
            }}
          >
            + New Chat
          </button>
          {chatHistory.map((chat) => (
            <div
              key={chat.chatId}
              style={{
                padding: '8px',
                marginBottom: '6px',
                backgroundColor: chat.chatId === currentChatId ? '#f3f4f6' : 'transparent',
                borderRadius: '6px',
                cursor: 'pointer',
                border: chat.chatId === currentChatId ? '1px solid #1f2937' : '1px solid transparent',
                transition: 'all 0.2s',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '6px'
              }}
              onClick={() => loadChat(chat)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#1f2937',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {chat.title}
                </div>
                <div style={{
                  fontSize: '10px',
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
                  fontSize: '14px',
                  padding: '0 2px',
                  flexShrink: 0
                }}
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px",
            minHeight: 0
          }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                marginBottom: 12,
                padding: "8px 12px",
                borderRadius: 8,
                backgroundColor: msg.role === "user" ? "#1f2937" : "#eff6ff",
                color: msg.role === "user" ? "#ffffff" : "#1f2937",
                fontSize: 13
              }}>
                {msg.content}
              </div>
            ))}
            {isLoading && (
              <div style={{
                marginBottom: 12,
                padding: "8px 12px",
                borderRadius: 8,
                backgroundColor: "#eff6ff",
                color: "#6b7280",
                fontSize: 13
              }}>
                Thinking...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div style={{
            padding: "16px",
            borderTop: "1px solid #e5e7eb",
            flexShrink: 0
          }}>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ask the coach a question..."
              style={{
                width: "100%",
                minHeight: 60,
                maxHeight: 120,
                padding: "8px 12px",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                fontSize: 13,
                resize: "none",
                marginBottom: 8,
                boxSizing: "border-box"
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={isLoading || !message.trim()}
              style={{
                width: "100%",
                padding: "8px 16px",
                backgroundColor: isLoading || !message.trim() ? "#9ca3af" : "#1f2937",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: isLoading || !message.trim() ? "not-allowed" : "pointer"
              }}
            >
              {isLoading ? "Thinking..." : "Send"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
