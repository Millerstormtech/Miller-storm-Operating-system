import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import { useAuth } from "../../contexts/AuthContext";

const WorldMap = dynamic(() => import("../../components/WorldMap"), { ssr: false, loading: () => <div style={{ width: "100%", height: "100%", background: "#f3f4f6", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: "13px" }}>Loading map...</div> });

type TrainingLink = {
  id: string;
  url: string;
  type: string;
  status: string;
  chars: number;
  originalName?: string;
};

type QAItem = {
  id: string;
  question: string;
  answer: string;
};

type AiBot = {
  id: string;
  name: string;
  status?: 'published' | 'draft';
  assignedRoles: string[];
  trainingLinks: TrainingLink[];
  trainingText: string;
  qaItems: QAItem[];
  // Course training data (new)
  selectedCourses?: string[];
  selectedFolders?: string[];
  selectedPages?: string[];
  courseTrainingText?: string;
  model: string;
  creativity: number;
  systemPrompt: string;
  totalChats: number;
  totalMessages: number;
  // Appearance
  botTitle: string;
  displayMessage: string;
  displayMessageEnabled: boolean;
  welcomeMessage: string;
  placeholder: string;
  suggestions: string[];
  removeSuggestionsAfterFirst: boolean;
  colorTheme: string;
  botAvatarUrl: string;
  showWelcomePopup: boolean;
  leadCollection: boolean;
  privacyPolicyEnabled: boolean;
  privacyActionText: string;
  privacyLinkText: string;
  privacyLink: string;
  chatIconSize: number;
  enterMessage: string;
  attentionSound: string;
  attentionAnimation: string;
  immediatelyOpenChat: boolean;
  // Settings
  isPublic: boolean;
  timezone: string;
  rateLimit: boolean;
  domainRestriction: boolean;
  allowedDomains: string;
  passwordProtection: boolean;
  teamMembers: string[];
  teamMemberAccess: Record<string, string[]>;
};

type BotView = "overview" | "chat-history" | "live-chat" | "links" | "text" | "qa" | "courses" | "tune" | "test" | "appearance" | "deploy" | "settings";

export function AiBotBuilder() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // Base path depends on user role
  const basePath = user?.role === "manager" ? "/manager/ai-bot-builder"
    : user?.role === "sales" ? "/sales/ai-bot-builder"
    : user?.role === "marketing" ? "/marketing/ai-bot-builder"
    : "/admin/ai-bots";
  const [bots, setBots] = useState<AiBot[]>([]);
  const [selectedBot, setSelectedBot] = useState<AiBot | null>(null);
  const [activeView, setActiveView] = useState<BotView>("links");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBotName, setNewBotName] = useState("");
  const [saving, setSaving] = useState(false);
  const [botsLoaded, setBotsLoaded] = useState(false);

  // Load bots, then restore selected bot + view from URL
  useEffect(() => {
    loadBots();
  }, []);

  // Once bots are loaded, restore from URL query params
  useEffect(() => {
    if (!botsLoaded) return;
    const { bot: botId, view } = router.query as { bot?: string; view?: string };
    if (botId) {
      const found = bots.find(b => b.id === botId);
      if (found) {
        setSelectedBot(found);
        setActiveView((view as BotView) || "links");
      } else {
        // Bot not found — clear URL and stay on list
        router.replace(basePath, undefined, { shallow: true });
      }
    }
  }, [botsLoaded]);

  async function loadBots() {
    const res = await fetch("/api/ai-bots");
    if (res.ok) {
      const data: AiBot[] = await res.json();
      // Admin: show all bots (published + draft)
      // Non-admin: only show published bots where user is a team member
      const filtered = isAdmin 
        ? data 
        : data.filter(b => 
            (b.status === 'published' || !b.status) && // Show if published or status not set (backward compatibility)
            b.teamMembers?.includes(user?.id || "")
          );
      setBots(filtered);
      setBotsLoaded(true);
    }
  }

  function selectBot(bot: AiBot, view: BotView = "links") {
    setSelectedBot(bot);
    setActiveView(view);
    router.push(`${basePath}?bot=${bot.id}&view=${view}`, undefined, { shallow: true });
  }

  function changeView(view: BotView) {
    setActiveView(view);
    if (selectedBot) {
      router.push(`${basePath}?bot=${selectedBot.id}&view=${view}`, undefined, { shallow: true });
    }
  }

  function goBack() {
    setSelectedBot(null);
    router.push(basePath, undefined, { shallow: true });
  }

  async function createBot() {
    if (!newBotName.trim()) return;
    const res = await fetch("/api/ai-bots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newBotName.trim() })
    });
    if (res.ok) {
      const bot = await res.json();
      setBots(prev => [bot, ...prev]);
      selectBot(bot, "links");
      setShowCreateModal(false);
      setNewBotName("");
    }
  }

  async function saveBot(updates: Partial<AiBot>) {
    if (!selectedBot) return;
    console.log('[Master Bot] Saving bot with updates:', updates);
    console.log('[Master Bot] Current bot status:', selectedBot.status);
    setSaving(true);
    try {
      const res = await fetch(`/api/ai-bots/${selectedBot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        const updated = await res.json();
        console.log('[Master Bot] Bot updated successfully:', updated);
        console.log('[Master Bot] Status in response:', updated.status);
        // If status is not in response, add it manually
        if (updates.status && !updated.status) {
          updated.status = updates.status;
        }
        setSelectedBot(updated);
        setBots(prev => prev.map(b => b.id === updated.id ? updated : b));
      } else {
        console.error('[Master Bot] Failed to update bot:', await res.text());
      }
    } catch (error) {
      console.error('[Master Bot] Error saving bot:', error);
    } finally {
      setSaving(false);
    }
  }

  async function deleteBot(botId: string) {
    if (!confirm("Delete this bot?")) return;
    await fetch(`/api/ai-bots/${botId}`, { method: "DELETE" });
    setBots(prev => prev.filter(b => b.id !== botId));
    if (selectedBot?.id === botId) goBack();
  }

  if (selectedBot) {
    // Determine allowed modules for this user — non-admin gets only what admin assigned
    const allowedModules: string[] = isAdmin
      ? ["overview", "chat-history", "live-chat", "links", "text", "qa", "courses", "tune", "test", "appearance", "deploy", "settings"]
      : (selectedBot.teamMemberAccess?.[user?.id || ""] || []);

    return (
      <BotDetailView
        bot={selectedBot}
        activeView={activeView}
        setActiveView={changeView}
        onSave={saveBot}
        saving={saving}
        onBack={goBack}
        isAdmin={isAdmin}
        allowedModules={allowedModules}
        onDeleteBot={(botId) => {
          setBots(prev => prev.filter(b => b.id !== botId));
          goBack();
        }}
      />
    );
  }

  return (
    <div style={{ padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>My Bots</h2>
          <p style={{ color: "#6b7280", margin: "4px 0 0", fontSize: "14px" }}>Build and manage your AI chatbots</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowCreateModal(true)} style={btnPrimary}>
            + Create New Bot
          </button>
        )}
      </div>

      {bots.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 20px", color: "#9ca3af" }}>
          <div style={{ fontSize: "56px", marginBottom: "16px" }}>🤖</div>
          {isAdmin ? (
            <>
              <div style={{ fontSize: "18px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>No bots yet</div>
              <div style={{ fontSize: "14px", marginBottom: "24px" }}>Create your first AI bot to get started</div>
              <button onClick={() => setShowCreateModal(true)} style={btnPrimary}>Create New Bot</button>
            </>
          ) : (
            <>
              <div style={{ fontSize: "18px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>No bots assigned</div>
              <div style={{ fontSize: "14px" }}>Ask your admin to assign you to a bot</div>
            </>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
          {bots.map((bot, index) => (
            <div
              key={bot.id}
              draggable
              onDragStart={e => { e.dataTransfer.setData("dragIndex", String(index)); e.dataTransfer.effectAllowed = "move"; (e.currentTarget as HTMLElement).style.opacity = "0.5"; }}
              onDragEnd={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; (e.currentTarget as HTMLElement).style.outline = "2px dashed #3b82f6"; }}
              onDragLeave={e => { (e.currentTarget as HTMLElement).style.outline = "none"; }}
              onDrop={e => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).style.outline = "none";
                const fromIndex = Number(e.dataTransfer.getData("dragIndex"));
                if (fromIndex === index) return;
                const updated = [...bots];
                const [moved] = updated.splice(fromIndex, 1);
                updated.splice(index, 0, moved);
                setBots(updated);
                fetch("/api/ai-bots", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ orderedIds: updated.map((b: any) => b.id) })
                }).then(r => r.json()).then(data => console.log("[drag-drop] save result:", data)).catch(console.error);
              }}
              style={{...botCard, position: "relative", cursor: "grab"}}
              onClick={() => { selectBot(bot, "links"); }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#1f2937", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "18px", overflow: "hidden", flexShrink: 0 }}>
                    {bot.botAvatarUrl
                      ? <img src={bot.botAvatarUrl} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : "🤖"}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "15px" }}>{bot.botTitle || bot.name}</div>
                    <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>
                      {bot.trainingLinks?.length || 0} sources · {bot.totalMessages || 0} messages
                    </div>
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); deleteBot(bot.id); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: "16px", padding: "4px", display: isAdmin ? "block" : "none" }}
                >
                  🗑
                </button>
              </div>
              <div style={{ marginTop: "16px", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {(bot.assignedRoles || []).map(r => (
                    <span key={r} style={{ fontSize: "11px", padding: "2px 8px", background: "#f3f4f6", borderRadius: "12px", color: "#374151", textTransform: "capitalize" }}>{r}</span>
                  ))}
                </div>
                {/* Status Badge */}
                <div style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: 600,
                  background: (bot.status || 'draft') === 'published' ? '#d1fae5' : '#fef3c7',
                  color: (bot.status || 'draft') === 'published' ? '#065f46' : '#92400e',
                  flexShrink: 0
                }}>
                  {(bot.status || 'draft') === 'published' ? 'Published' : 'Draft'}
                </div>
              </div>
            </div>
          ))}
          <div style={{ ...botCard, border: "2px dashed #d1d5db", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", minHeight: "120px" }}
            onClick={() => setShowCreateModal(true)}>
            <div style={{ textAlign: "center", color: "#9ca3af" }}>
              <div style={{ fontSize: "28px" }}>+</div>
              <div style={{ fontSize: "13px", marginTop: "4px" }}>Create New Bot</div>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <Modal onClose={() => { setShowCreateModal(false); setNewBotName(""); }}>
          <h3 style={{ margin: "0 0 8px", fontSize: "18px", fontWeight: 700 }}>Create New Bot</h3>
          <p style={{ margin: "0 0 20px", color: "#6b7280", fontSize: "14px" }}>Give your chatbot a name to easily identify it</p>
          <input
            autoFocus
            value={newBotName}
            onChange={e => setNewBotName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && createBot()}
            placeholder="e.g. Jay's Bot"
            style={inputStyle}
          />
          <div style={{ display: "flex", gap: "10px", marginTop: "20px", justifyContent: "flex-end" }}>
            <button onClick={() => { setShowCreateModal(false); setNewBotName(""); }} style={btnSecondary}>Close</button>
            <button onClick={createBot} disabled={!newBotName.trim()} style={{ ...btnPrimary, opacity: newBotName.trim() ? 1 : 0.5 }}>Let's Go</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Bot Detail View ────────────────────────────────────────────────────────

function BotDetailView({ bot, activeView, setActiveView, onSave, saving, onBack, onDeleteBot, isAdmin, allowedModules }: {
  bot: AiBot;
  activeView: BotView;
  setActiveView: (v: BotView) => void;
  onSave: (updates: Partial<AiBot>) => void;
  saving: boolean;
  onBack: () => void;
  onDeleteBot: (botId: string) => void;
  isAdmin: boolean;
  allowedModules: string[];
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navItems: { id: BotView; label: string; icon: string; section?: string }[] = ([
    { id: "overview",      label: "Overview",      icon: "📊", section: "ACTIVITY" },
    { id: "chat-history",  label: "Chat History",  icon: "💬" },
    { id: "links",         label: "Links / Docs",  icon: "🔗", section: "TRAINING DATA" },
    { id: "text",          label: "Text",          icon: "📝" },
    { id: "qa",            label: "Q&A",           icon: "❓" },
    { id: "courses",       label: "Courses",       icon: "📚" },
    { id: "live-chat",     label: "Live Chat",     icon: "🟢" },
    { id: "tune",          label: "Tune AI",       icon: "⚙️", section: "BEHAVIOUR" },
    { id: "test",          label: "Test Your Bot", icon: "🧪" },
    { id: "appearance",    label: "Appearance",    icon: "🎨", section: "DEPLOYMENT" },
    { id: "deploy",        label: "Deploy",        icon: "🚀" },
    { id: "settings",      label: "Settings",      icon: "🔧", section: "ADVANCED" },
  ] as { id: BotView; label: string; icon: string; section?: string }[]).filter(item => allowedModules.includes(item.id));

  const activeItem = navItems.find(n => n.id === activeView);

  function handleNavSelect(id: BotView) {
    setActiveView(id);
    setMobileNavOpen(false);
  }

  const sidebarContent = (
    <>
      <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #e5e7eb" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: "15px", padding: 0, display: "flex", alignItems: "center", gap: "6px", marginBottom: "16px", fontWeight: 500 }}>
          ← All Bots
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#1f2937", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "20px", flexShrink: 0, overflow: "hidden" }}>
            {bot.botAvatarUrl
              ? <img src={bot.botAvatarUrl} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : "🤖"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <EditableBotName bot={bot} onSave={onSave} />
          </div>
        </div>
        {/* Published/Draft Toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "8px" }}>
          <span style={{ fontSize: "13px", color: "#6b7280", fontWeight: 500 }}>Status:</span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ 
              fontSize: "12px", 
              fontWeight: 600,
              color: (bot.status || 'draft') === 'draft' ? '#1f2937' : '#9ca3af'
            }}>
              Draft
            </span>
            <div
              onClick={async () => {
                const currentStatus = bot.status || 'draft';
                const newStatus = currentStatus === 'published' ? 'draft' : 'published';
                await onSave({ status: newStatus });
              }}
              style={{
                width: "44px",
                height: "24px",
                borderRadius: "12px",
                cursor: "pointer",
                background: (bot.status || 'draft') === 'published' ? '#10b981' : '#d1d5db',
                position: "relative",
                transition: "all 0.3s ease",
                padding: 0
              }}
            >
              <div style={{
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                background: "#fff",
                position: "absolute",
                top: "2px",
                left: (bot.status || 'draft') === 'published' ? "22px" : "2px",
                transition: "all 0.3s ease",
                boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
              }} />
            </div>
            <span style={{ 
              fontSize: "12px", 
              fontWeight: 600,
              color: (bot.status || 'draft') === 'published' ? '#10b981' : '#9ca3af'
            }}>
              Published
            </span>
          </div>
        </div>
      </div>
      <nav style={{ padding: "10px 0", flex: 1, overflowY: "auto" }}>
        {navItems.map(item => (
          <div key={item.id}>
            {item.section && (
              <div style={{ padding: "14px 20px 6px", fontSize: "12px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.1em" }}>{item.section}</div>
            )}
            <button
              onClick={() => handleNavSelect(item.id)}
              style={{
                width: "100%", textAlign: "left", padding: "11px 20px", border: "none", cursor: "pointer",
                fontSize: "15px", fontWeight: activeView === item.id ? 600 : 500,
                background: activeView === item.id ? "#f3f4f6" : "transparent",
                color: activeView === item.id ? "#1f2937" : "#4b5563",
                borderLeft: activeView === item.id ? "3px solid #1f2937" : "3px solid transparent",
                display: "flex", alignItems: "center", gap: "10px",
                transition: "background 0.15s"
              }}
            >
              <span style={{ fontSize: "18px", width: "22px", textAlign: "center" }}>{item.icon}</span>
              {item.label}
            </button>
          </div>
        ))}
      </nav>
    </>
  );

  return (
    <div style={{ display: "flex", height: "calc(100vh - 64px)", overflow: "hidden", position: "relative" }}>

      {/* ── Desktop Sidebar ── */}
      <div style={{ width: "260px", minWidth: "260px", background: "#fff", borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column" }} className="bot-sidebar-desktop">
        {sidebarContent}
      </div>

      {/* ── Mobile overlay backdrop ── */}
      {mobileNavOpen && (
        <div
          onClick={() => setMobileNavOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200 }}
        />
      )}

      {/* ── Mobile Drawer ── */}
      <div style={{
        position: "fixed", top: 0, left: 0, bottom: 0, width: "280px",
        background: "#fff", zIndex: 201, display: "flex", flexDirection: "column",
        transform: mobileNavOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.25s ease", boxShadow: "4px 0 24px rgba(0,0,0,0.15)"
      }} className="bot-sidebar-mobile">
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 16px" }}>
          <button onClick={() => setMobileNavOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "22px", color: "#6b7280" }}>✕</button>
        </div>
        {sidebarContent}
      </div>

      {/* ── Main Content ── */}
      <div style={{ flex: 1, overflowY: "auto", background: "#f9fafb", display: "flex", flexDirection: "column" }}>

        {/* Mobile top bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", background: "#fff", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }} className="bot-mobile-topbar">
          <button
            onClick={() => setMobileNavOpen(true)}
            style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: "8px", cursor: "pointer", padding: "8px 10px", fontSize: "18px", color: "#374151", display: "flex", alignItems: "center", gap: "6px" }}
          >
            ☰ <span style={{ fontSize: "13px", fontWeight: 600 }}>{activeItem?.label}</span>
          </button>
          <div style={{ fontSize: "13px", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🤖 {bot.name}</div>
        </div>

        <div style={{ flex: 1 }}>
          {activeView === "overview"     && <OverviewPanel bot={bot} />}
          {activeView === "chat-history" && <ChatHistoryPanel bot={bot} />}
          {activeView === "live-chat"    && <LiveChatPanel bot={bot} />}
          {activeView === "links"        && <LinksPanel bot={bot} onSave={onSave} saving={saving} />}
          {activeView === "text"         && <TextPanel bot={bot} onSave={onSave} saving={saving} />}
          {activeView === "qa"           && <QAPanel bot={bot} onSave={onSave} saving={saving} />}
          {activeView === "courses"      && <CoursesPanel bot={bot} onSave={onSave} saving={saving} />}
          {activeView === "tune"         && <TunePanel bot={bot} onSave={onSave} saving={saving} />}
          {activeView === "test"         && <TestPanel bot={bot} />}
          {activeView === "appearance"   && <AppearancePanel bot={bot} onSave={onSave} saving={saving} />}
          {activeView === "deploy"       && <DeployPanel bot={bot} onSave={onSave} saving={saving} onGoToSettings={() => setActiveView("settings")} />}
          {activeView === "settings"     && <SettingsPanel bot={bot} onSave={onSave} saving={saving} onDelete={() => onDeleteBot(bot.id)} />}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .bot-sidebar-desktop { display: none !important; }
          .bot-mobile-topbar { display: flex !important; }
          .bot-panel-padding { padding: 16px !important; }
          .bot-links-grid { grid-template-columns: 1fr !important; }
          .bot-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .bot-overview-grid { grid-template-columns: 1fr !important; }
          .bot-tune-model-grid { grid-template-columns: 1fr !important; }
          .bot-qa-header { flex-direction: column !important; align-items: flex-start !important; gap: 12px !important; }
        }
        @media (min-width: 769px) {
          .bot-sidebar-desktop { display: flex !important; }
          .bot-mobile-topbar { display: none !important; }
          .bot-sidebar-mobile { display: none !important; }
        }
      `}</style>
    </div>
  );
}

// ─── World Map Card ───────────────────────────────────────────────────────────

function WorldMapCard() {
  return (
    <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e5e7eb", padding: "22px 24px", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px" }}>🌐</div>
        <div>
          <div style={{ fontSize: "13px", color: "#9ca3af" }}>Popular Countries</div>
          <div style={{ fontSize: "11px", color: "#d1d5db" }}>Last 28 days</div>
        </div>
      </div>
      <div style={{ width: "100%", height: "380px", borderRadius: "8px", overflow: "hidden", background: "#f8fafc" }}>
        <WorldMap />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}>
        <span style={{ fontSize: "10px", color: "#9ca3af" }}>0</span>
        <div style={{ flex: 1, height: "5px", borderRadius: "3px", background: "linear-gradient(to right, #e0f2fe, #38bdf8, #818cf8, #f472b6, #fb923c, #4ade80)" }} />
        <span style={{ fontSize: "10px", color: "#9ca3af" }}>∞</span>
      </div>
    </div>
  );
}


// ─── Overview Panel ──────────────────────────────────────────────────────────

function OverviewPanel({ bot }: { bot: AiBot }) {
  const totalChars = (bot.trainingLinks || []).reduce((s: number, l: any) => s + (l.chars || 0), 0);
  const maxChars = 1_000_000;

  const statCards = [
    {
      icon: "⏱",
      label: "Today's Users and time",
      values: [
        { num: 0, sub: "Users" },
        { num: bot.totalMessages || 0, sub: "Messages" },
      ],
    },
    {
      icon: "💬",
      label: "Message",
      values: [{ num: `${bot.totalMessages || 0} / 50`, sub: "Has sent" }],
      corner: "💬",
    },
    {
      icon: "📝",
      label: "Training",
      values: [{ num: `${totalChars.toLocaleString()} / 1M`, sub: "Characters used" }],
      corner: "✏️",
    },
  ];

  return (
    <div style={{ padding: "32px" }} className="bot-panel-padding">
      <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "24px", color: "#1f2937" }}>Overview</h2>

      {/* 3 stat cards in one row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "20px" }}>
        {statCards.map((card, ci) => (
          <div key={ci} style={{ background: "#fff", borderRadius: "14px", padding: "22px 24px", border: "1px solid #e5e7eb", position: "relative", minHeight: "120px" }}>
            {/* corner icon */}
            {card.corner && (
              <div style={{ position: "absolute", top: "16px", right: "16px", fontSize: "18px", color: "#d1d5db" }}>{card.corner}</div>
            )}
            {/* top icon + label */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px" }}>{card.icon}</div>
              <span style={{ fontSize: "13px", color: "#9ca3af" }}>{card.label}</span>
            </div>
            {/* values row */}
            <div style={{ display: "flex", gap: "32px" }}>
              {card.values.map((v, vi) => (
                <div key={vi}>
                  <div style={{ fontSize: "28px", fontWeight: 700, color: "#1f2937", lineHeight: 1 }}>{v.num}</div>
                  <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px" }}>{v.sub}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* World map card */}
      <WorldMapCard />
    </div>
  );
}

// ─── Live Chat Panel ──────────────────────────────────────────────────────────

function LiveChatPanel({ bot }: { bot: AiBot }) {
  type Attachment = { name: string; url: string; type: string };
  type Msg = { role: "user"|"assistant"; content: string; timestamp: string; attachments?: Attachment[] };
  const [chatSessions, setChatSessions] = useState<any[]>([]);
  const [currentChatId, setCurrentChatId] = useState(() => `admin-live-${bot.id}-${Date.now()}`);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const theme      = (bot as any).colorTheme || "#3b82f6";
  const botTitle   = (bot as any).botTitle || bot.name;
  const avatarUrl  = (bot as any).botAvatarUrl || "";
  const welcome    = (bot as any).welcomeMessage || "Hi, How can I help you today?";
  const ph         = (bot as any).placeholder || "Ask me anything...";
  const suggestions = (!suggestionsDismissed && messages.length === 0) ? ((bot as any).suggestions || []) : [];
  const sidebarBg  = "#ffffff";
  const sidebarDark = "#f3f4f6";
  const isNewChat  = messages.length === 0;

  useEffect(() => { loadSessions(); }, [bot.id]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function loadSessions() {
    const res = await fetch(`/api/ai-bots/admin-chats?botId=${bot.id}`);
    if (res.ok) setChatSessions(await res.json());
  }

  function newChatId() { return `admin-live-${bot.id}-${Date.now()}`; }

  function startNewChat() {
    setMessages([]); setInput(""); setAttachments([]); setSuggestionsDismissed(false);
    setCurrentChatId(newChatId());
  }

  function loadSession(session: any) {
    setMessages(session.messages || []);
    setCurrentChatId(session.chatId);
    setSuggestionsDismissed(true);
    setSidebarCollapsed(true);
  }

  async function deleteSession(chatId: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch("/api/ai-bots/chats", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId }) });
    setChatSessions(prev => prev.filter(s => s.chatId !== chatId));
    if (currentChatId === chatId) startNewChat();
  }

  async function send(prefill?: string) {
    const text = prefill ?? input.trim();
    if ((!text && attachments.length === 0) || loading) return;
    const userMsg: Msg = { role: "user", content: text, timestamp: new Date().toISOString(), attachments: attachments.length > 0 ? [...attachments] : undefined };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages); setInput(""); setAttachments([]);
    if ((bot as any).removeSuggestionsAfterFirst) setSuggestionsDismissed(true);
    if (textareaRef.current) textareaRef.current.style.height = "52px";
    setLoading(true);
    try {
      const res = await fetch("/api/ai-bots/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId: bot.id, messages: newMessages.map(m => ({ role: m.role, content: m.content })), chatId: currentChatId, userId: "admin", userName: "Admin", userEmail: "", userRole: "admin" })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.message || "Error", timestamp: new Date().toISOString() }]);
      loadSessions();
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Failed to get response.", timestamp: new Date().toISOString() }]);
    } finally { setLoading(false); }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAttachments(prev => [...prev, { name: file.name, url: reader.result as string, type: file.type }]);
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function autoResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target; el.style.height = "52px";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }

  function AvatarImg({ size, fontSize }: { size: number; fontSize: string }) {
    return (
      <div style={{ width: size, height: size, borderRadius: "50%", background: theme, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
        {avatarUrl ? <img src={avatarUrl} alt="bot" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize, color: "#fff" }}>🤖</span>}
      </div>
    );
  }

  return (
    <div style={{ padding: "32px", height: "100%", display: "flex", flexDirection: "column" }} className="bot-panel-padding">
      <div style={{ marginBottom: "20px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>Live Chat</h2>
        <p style={{ color: "#6b7280", fontSize: "14px", margin: 0 }}>Chat with the bot — conversations are saved to Chat History</p>
      </div>

      <div style={{ flex: 1, display: "flex", background: "#fff", borderRadius: "12px", border: "1px solid #e5e7eb", overflow: "hidden", minHeight: "500px" }}>

        {/* Sidebar */}
        <div className={`lchat-sidebar${sidebarCollapsed ? " lchat-sidebar-hidden" : ""}`}
          style={{ width: "240px", minWidth: "240px", background: "#fff", borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", overflow: "hidden", transition: "width 0.2s, min-width 0.2s", flexShrink: 0 }}>
          <div style={{ padding: "14px", borderBottom: "1px solid #e5e7eb" }}>
            <button onClick={startNewChat} style={{ width: "100%", padding: "9px 12px", background: "#f3f4f6", color: "#1f2937", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>✏️</span> New Chat
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
            {chatSessions.length === 0
              ? <div style={{ padding: "20px 12px", color: "#9ca3af", fontSize: "12px", textAlign: "center" }}>No chats yet</div>
              : chatSessions.filter(s => s.userId === "admin").map(session => (
                <div key={session.chatId} onClick={() => loadSession(session)}
                  style={{ padding: "10px 12px", borderRadius: "8px", cursor: "pointer", marginBottom: "2px", background: currentChatId === session.chatId ? "#f3f4f6" : "transparent", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", color: "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>💬 {session.title}</div>
                    <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>{new Date(session.updatedAt).toLocaleDateString()}</div>
                  </div>
                  <button onClick={e => deleteSession(session.chatId, e)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "14px", padding: "2px 4px", flexShrink: 0 }}>🗑</button>
                </div>
              ))
            }
          </div>
          <div style={{ padding: "12px 14px", borderTop: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: "8px" }}>
            <AvatarImg size={26} fontSize="12px" />
            <div style={{ fontSize: "12px", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{botTitle}</div>
          </div>
        </div>

        {/* Main chat */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Header */}
          <div style={{ padding: "0 20px", background: theme, display: "flex", alignItems: "center", gap: "12px", flexShrink: 0, minHeight: "54px" }}>
            <button onClick={() => setSidebarCollapsed(p => !p)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "rgba(255,255,255,0.8)", padding: "4px" }}>☰</button>
            <AvatarImg size={32} fontSize="15px" />
            <div style={{ fontWeight: 700, fontSize: "15px", color: "#fff", flex: 1 }}>{botTitle}</div>
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.15)", padding: "3px 10px", borderRadius: "12px" }}>Admin</span>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 0" }}>
            {isNewChat ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center", padding: "40px" }}>
                <div style={{ marginBottom: "16px" }}><AvatarImg size={64} fontSize="28px" /></div>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#1f2937", marginBottom: "8px" }}>{welcome}</div>
                {suggestions.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center", marginTop: "16px", maxWidth: "500px" }}>
                    {suggestions.map((s: string, i: number) => (
                      <button key={i} onClick={() => send(s)} style={{ padding: "8px 16px", border: `1.5px solid ${theme}`, borderRadius: "20px", fontSize: "13px", color: theme, background: "#fff", cursor: "pointer", fontWeight: 500 }}>{s}</button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ maxWidth: "760px", margin: "0 auto", padding: "0 24px", display: "flex", flexDirection: "column", gap: "24px" }}>
                {messages.map((m, i) => (
                  <div key={i} style={{ display: "flex", gap: "14px", alignItems: "flex-start", flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", background: m.role === "user" ? "#1f2937" : theme, color: "#fff", overflow: "hidden" }}>
                      {m.role === "user" ? "👤" : (avatarUrl ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🤖")}
                    </div>
                    <div style={{ flex: 1, maxWidth: "85%", display: "flex", flexDirection: "column", gap: "6px", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                      {(m as any).attachments?.length > 0 && (
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                          {(m as any).attachments.map((att: any, ai: number) => (
                            <div key={ai} style={{ padding: "5px 10px", background: m.role === "user" ? "rgba(31,41,55,0.1)" : "#f3f4f6", borderRadius: "8px", fontSize: "12px", color: "#374151", display: "flex", alignItems: "center", gap: "5px" }}>
                              {att.type?.startsWith("image/") ? <img src={att.url} alt={att.name} style={{ width: 36, height: 36, objectFit: "cover", borderRadius: "4px" }} /> : <span>📎</span>}
                              <span style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {m.content && (
                        <div style={{ padding: "12px 16px", borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px", background: m.role === "user" ? "#1f2937" : "#f9fafb", color: m.role === "user" ? "#fff" : "#1f2937", fontSize: "15px", lineHeight: "1.6", border: m.role === "assistant" ? "1px solid #e5e7eb" : "none", whiteSpace: "pre-wrap" }}>
                          {m.content}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: theme, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                      {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: "#fff" }}>🤖</span>}
                    </div>
                    <div style={{ padding: "12px 16px", borderRadius: "18px 18px 18px 4px", background: "#f9fafb", border: "1px solid #e5e7eb" }}>
                      <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                        {[0,1,2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#9ca3af", animation: `lchat-bounce 1.2s ${i*0.2}s infinite` }} />)}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ padding: "16px 24px", borderTop: "1px solid #f3f4f6", flexShrink: 0 }}>
            <div style={{ maxWidth: "760px", margin: "0 auto" }}>
              {attachments.length > 0 && (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                  {attachments.map((att, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "5px 10px", background: "#f3f4f6", borderRadius: "8px", fontSize: "12px" }}>
                      {att.type.startsWith("image/") ? <img src={att.url} alt={att.name} style={{ width: 32, height: 32, objectFit: "cover", borderRadius: "4px" }} /> : <span>📎</span>}
                      <span style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</span>
                      <button onClick={() => setAttachments(prev => prev.filter((_,idx) => idx !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: "16px", padding: 0, lineHeight: 1 }}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*,.pdf,.docx,.doc,.txt,.csv,.xlsx" style={{ display: "none" }} onChange={handleFile} />
              <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#f9fafb", borderRadius: "14px", border: "1px solid #e5e7eb", padding: "8px 12px" }}>
                <button onClick={() => fileRef.current?.click()} title="Attach file"
                  style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "#e5e7eb", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", fontWeight: 300, flexShrink: 0, lineHeight: 1 }}>+</button>
                <textarea ref={textareaRef} value={input} onChange={autoResize} onKeyDown={handleKeyDown} placeholder={ph} rows={1}
                  style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: "14px", resize: "none", lineHeight: "1.6", fontFamily: "inherit", height: "36px", maxHeight: "200px", overflowY: "auto", padding: "0", color: "#1f2937", alignSelf: "center" }} />
                <button onClick={() => send()} disabled={loading || (!input.trim() && attachments.length === 0)}
                  style={{ width: 34, height: 34, borderRadius: "50%", border: "none", cursor: loading || (!input.trim() && attachments.length === 0) ? "not-allowed" : "pointer", background: loading || (!input.trim() && attachments.length === 0) ? "#e5e7eb" : theme, color: loading || (!input.trim() && attachments.length === 0) ? "#9ca3af" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0 }}>↑</button>
              </div>
              <div style={{ textAlign: "center", fontSize: "11px", color: "#d1d5db", marginTop: "8px" }}>Enter to send · Shift+Enter for new line</div>
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes lchat-bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} } @media(max-width:768px){.lchat-sidebar{position:absolute!important;top:0;bottom:0;left:0;z-index:50;}.lchat-sidebar-hidden{width:0!important;min-width:0!important;overflow:hidden!important;}} @media(min-width:769px){.lchat-sidebar-hidden{width:0!important;min-width:0!important;overflow:hidden!important;}}`}</style>
    </div>
  );
}

// ─── Chat History Panel ───────────────────────────────────────────────────────

// ─── Date Range Picker ───────────────────────────────────────────────────────

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS   = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function fmt(d: Date) {
  return `${MONTHS[d.getMonth()].slice(0,3)} ${d.getDate()}`;
}

function startOfDay(d: Date) {
  const c = new Date(d); c.setHours(0,0,0,0); return c;
}

function DateRangePicker({ from, to, onChange }: {
  from: Date | null; to: Date | null;
  onChange: (from: Date, to: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [selecting, setSelecting] = useState<Date | null>(null); // first click
  const today = startOfDay(new Date());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear]   = useState(today.getFullYear());
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function applyPreset(label: string) {
    const now = startOfDay(new Date());
    let f: Date, t: Date;
    if (label === "Current week") {
      const day = now.getDay();
      f = new Date(now); f.setDate(now.getDate() - day);
      t = new Date(f); t.setDate(f.getDate() + 6);
    } else if (label === "Last 7 Days") {
      t = now; f = new Date(now); f.setDate(now.getDate() - 6);
    } else if (label === "Current month") {
      f = new Date(now.getFullYear(), now.getMonth(), 1);
      t = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (label === "Last 3 months") {
      t = now; f = new Date(now); f.setMonth(now.getMonth() - 3);
    } else { // Current Year
      f = new Date(now.getFullYear(), 0, 1);
      t = new Date(now.getFullYear(), 11, 31);
    }
    setViewMonth(f.getMonth()); setViewYear(f.getFullYear());
    setSelecting(null);
    onChange(f, t);
    setOpen(false);
  }

  function handleDayClick(d: Date) {
    if (!selecting) {
      setSelecting(d);
    } else {
      const [f, t] = d < selecting ? [d, selecting] : [selecting, d];
      setSelecting(null);
      onChange(f, t);
      setOpen(false);
    }
  }

  // Build calendar days
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewYear, viewMonth, d));

  function inRange(d: Date) {
    const rangeEnd = selecting ? (hoverDate || selecting) : to;
    const rangeStart = selecting || from;
    if (!rangeStart || !rangeEnd) return false;
    const [s, e] = rangeStart <= rangeEnd ? [rangeStart, rangeEnd] : [rangeEnd, rangeStart];
    return d > s && d < e;
  }
  function isStart(d: Date) {
    const s = selecting || from;
    return !!s && startOfDay(s).getTime() === d.getTime();
  }
  function isEnd(d: Date) {
    const e = selecting ? (hoverDate || selecting) : to;
    return !!e && startOfDay(e).getTime() === d.getTime();
  }

  const label = from && to ? `${fmt(from)}  →  ${fmt(to)}` : "Select date range";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          display: "flex", alignItems: "center", gap: "10px",
          padding: "9px 16px", border: `2px solid ${open ? "#3b82f6" : "#e5e7eb"}`,
          borderRadius: "10px", background: "#fff", cursor: "pointer",
          fontSize: "14px", fontWeight: 500, color: "#1f2937",
          whiteSpace: "nowrap", transition: "border-color 0.15s"
        }}
      >
        <span style={{ fontSize: "16px" }}>📅</span>
        {label}
        <span style={{ fontSize: "11px", color: "#6b7280", marginLeft: "2px" }}>{open ? "▲" : "▼"}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 500,
          background: "#fff", borderRadius: "14px", boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
          border: "1px solid #e5e7eb", display: "flex", overflow: "hidden", minWidth: "560px"
        }}>
          {/* Presets */}
          <div style={{ width: "160px", borderRight: "1px solid #f3f4f6", padding: "12px 0", flexShrink: 0 }}>
            {["Current week","Last 7 Days","Current month","Last 3 months","Current Year"].map(p => (
              <button key={p} onClick={() => applyPreset(p)} style={{
                width: "100%", textAlign: "left", padding: "11px 20px",
                border: "none", background: "none", cursor: "pointer",
                fontSize: "14px", color: "#374151", fontWeight: 400,
                transition: "background 0.1s"
              }}
                onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                onMouseLeave={e => (e.currentTarget.style.background = "none")}
              >{p}</button>
            ))}
          </div>

          {/* Calendar */}
          <div style={{ padding: "20px 24px", flex: 1 }}>
            {/* Month nav */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <button onClick={() => {
                let m = viewMonth - 1, y = viewYear;
                if (m < 0) { m = 11; y--; }
                setViewMonth(m); setViewYear(y);
              }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#6b7280", padding: "4px 8px" }}>‹</button>
              <span style={{ fontWeight: 700, fontSize: "16px", color: "#1f2937" }}>{MONTHS[viewMonth]} {viewYear}</span>
              <button onClick={() => {
                let m = viewMonth + 1, y = viewYear;
                if (m > 11) { m = 0; y++; }
                setViewMonth(m); setViewYear(y);
              }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#6b7280", padding: "4px 8px" }}>›</button>
            </div>

            {/* Day headers */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: "6px" }}>
              {DAYS.map(d => (
                <div key={d} style={{ textAlign: "center", fontSize: "12px", color: "#9ca3af", fontWeight: 600, padding: "4px 0" }}>{d}</div>
              ))}
            </div>

            {/* Day cells */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
              {cells.map((d, i) => {
                if (!d) return <div key={`e-${i}`} />;
                const start = isStart(d), end = isEnd(d), range = inRange(d);
                const isToday = d.getTime() === today.getTime();
                const bg = start || end ? "#3b82f6" : range ? "#dbeafe" : "transparent";
                const color = start || end ? "#fff" : range ? "#1d4ed8" : "#1f2937";
                return (
                  <div
                    key={d.getTime()}
                    onClick={() => handleDayClick(d)}
                    onMouseEnter={() => selecting && setHoverDate(d)}
                    onMouseLeave={() => selecting && setHoverDate(null)}
                    style={{
                      textAlign: "center", padding: "7px 4px", borderRadius: "8px",
                      cursor: "pointer", fontSize: "14px", fontWeight: isToday ? 700 : 400,
                      background: bg, color,
                      border: isToday && !start && !end ? "1.5px solid #3b82f6" : "1.5px solid transparent",
                      transition: "background 0.1s"
                    }}
                  >{d.getDate()}</div>
                );
              })}
            </div>

            {selecting && (
              <div style={{ marginTop: "12px", fontSize: "12px", color: "#6b7280", textAlign: "center" }}>
                Click a second date to complete the range
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Chat History Panel ───────────────────────────────────────────────────────

function ChatHistoryPanel({ bot }: { bot: AiBot }) {
  const [chats, setChats] = useState<any[]>([]);
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo]     = useState<Date | null>(null);

  useEffect(() => { loadChats(); }, [bot.id]);

  async function loadChats() {
    setLoading(true);
    try {
      const res = await fetch(`/api/ai-bots/admin-chats?botId=${bot.id}`);
      if (res.ok) setChats(await res.json());
    } finally { setLoading(false); }
  }

  const filtered = chats.filter(c => {
    const matchSearch = !search ||
      c.userName?.toLowerCase().includes(search.toLowerCase()) ||
      c.userEmail?.toLowerCase().includes(search.toLowerCase()) ||
      c.title?.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" || c.userRole === roleFilter;
    let matchDate = true;
    if (dateFrom || dateTo) {
      const d = new Date(c.updatedAt); d.setHours(0,0,0,0);
      if (dateFrom && d < dateFrom) matchDate = false;
      if (dateTo) { const end = new Date(dateTo); end.setHours(23,59,59,999); if (d > end) matchDate = false; }
    }
    return matchSearch && matchRole && matchDate;
  });

  if (selectedChat) {
    return (
      <div style={{ padding: "32px" }} className="bot-panel-padding">
        <button onClick={() => setSelectedChat(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: "14px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "6px" }}>
          ← Back
        </button>
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontWeight: 700, fontSize: "16px" }}>{selectedChat.title}</div>
          <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
            {selectedChat.userName} · {selectedChat.userEmail} · <span style={{ textTransform: "capitalize" }}>{selectedChat.userRole}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "700px" }}>
          {selectedChat.messages?.map((m: any, i: number) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "75%", padding: "10px 14px", borderRadius: "16px", fontSize: "14px", lineHeight: "1.6",
                background: m.role === "user" ? "#1f2937" : "#f3f4f6",
                color: m.role === "user" ? "#fff" : "#1f2937",
                whiteSpace: "pre-wrap"
              }}>
                {m.content}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const thStyle: React.CSSProperties = { padding: "10px 14px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.07em", textTransform: "uppercase", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" };
  const tdStyle: React.CSSProperties = { padding: "12px 14px", fontSize: "13px", color: "#374151", borderBottom: "1px solid #f3f4f6", verticalAlign: "middle" };

  return (
    <div style={{ padding: "32px" }} className="bot-panel-padding">
      <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>Chat History</h2>
      <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "24px" }}>All conversations with this bot</p>

      {/* Filters */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by user, email or title..."
          style={{ width: "280px", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "13px", outline: "none" }}
        />
        <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(null); setDateTo(null); }}
            style={{ padding: "9px 14px", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#fff", cursor: "pointer", fontSize: "13px", color: "#6b7280" }}>
            ✕ Clear
          </button>
        )}
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          style={{ padding: "9px 14px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "13px", background: "#fff", cursor: "pointer" }}>
          <option value="all">All Roles</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="sales">Sales</option>
          <option value="marketing">Marketing</option>
        </select>
        <span style={{ fontSize: "13px", color: "#6b7280", marginLeft: "auto" }}>{filtered.length} total items</span>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#9ca3af" }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: "12px", padding: "60px 20px", border: "1px solid #e5e7eb", textAlign: "center", color: "#9ca3af" }}>
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>💬</div>
          <div style={{ fontSize: "16px", fontWeight: 500, color: "#374151" }}>No conversations yet</div>
          <div style={{ fontSize: "14px", marginTop: "8px" }}>Chats will appear here once users start talking to this bot</div>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e5e7eb", overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#f8fafc" }}>
                <tr>
                  <th style={{ ...thStyle, width: 36 }}><input type="checkbox" /></th>
                  <th style={thStyle}>Started</th>
                  <th style={thStyle}>Last Message</th>
                  <th style={thStyle}>User</th>
                  <th style={thStyle}>Role</th>
                  <th style={thStyle}>Language</th>
                  <th style={thStyle}>Model</th>
                  <th style={thStyle}>Messages</th>
                  <th style={thStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((chat, idx) => {
                  const lastMsg = chat.messages?.[chat.messages.length - 1];
                  const lastContent = lastMsg?.content?.substring(0, 40) + (lastMsg?.content?.length > 40 ? "..." : "") || "-";
                  const roleColor: Record<string, string> = { admin: "#f3f4f6", manager: "#ede9fe", sales: "#dbeafe", marketing: "#dcfce7" };
                  const roleText: Record<string, string> = { admin: "#374151", manager: "#6d28d9", sales: "#1d4ed8", marketing: "#15803d" };
                  return (
                    <tr key={chat.chatId} style={{ background: idx % 2 === 0 ? "#fff" : "#fafafa" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#f0f9ff")}
                      onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? "#fff" : "#fafafa")}>
                      <td style={tdStyle}><input type="checkbox" /></td>
                      <td style={tdStyle}>
                        <div style={{ fontSize: "13px" }}>{new Date(chat.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                        <div style={{ fontSize: "11px", color: "#9ca3af" }}>{new Date(chat.updatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
                      </td>
                      <td style={{ ...tdStyle, maxWidth: "220px" }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#374151" }}>{lastContent}</div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, fontSize: "13px" }}>{chat.userName || "-"}</div>
                        <div style={{ fontSize: "11px", color: "#9ca3af" }}>{chat.userEmail || ""}</div>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ padding: "2px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 600, background: roleColor[chat.userRole] || "#f3f4f6", color: roleText[chat.userRole] || "#374151", textTransform: "capitalize" }}>
                          {chat.userRole || "-"}
                        </span>
                      </td>
                      <td style={tdStyle}><span style={{ fontSize: "12px", color: "#6b7280" }}>English</span></td>
                      <td style={tdStyle}>
                        <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", fontWeight: 600, color: "#374151" }}>
                          🤖 {bot.model || "gpt-4o-mini"}
                        </span>
                      </td>
                      <td style={tdStyle}>{chat.messages?.length || 0}</td>
                      <td style={tdStyle}>
                        <button onClick={() => setSelectedChat(chat)}
                          style={{ padding: "5px 12px", borderRadius: "6px", border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontSize: "12px", color: "#374151", fontWeight: 500 }}>
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Links / Docs Panel ───────────────────────────────────────────────────────

function LinksPanel({ bot, onSave, saving }: { bot: AiBot; onSave: (u: Partial<AiBot>) => void; saving: boolean }) {
  const [url, setUrl] = useState("");
  const [urlType, setUrlType] = useState("webpage");
  const [links, setLinks] = useState<TrainingLink[]>(bot.trainingLinks || []);
  const [crawling, setCrawling] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const totalChars = links.reduce((s, l) => s + (l.chars || 0), 0);
  const maxChars = 1_000_000;

  async function addLink() {
    if (!url.trim() || crawling) return;
    const trimmedUrl = url.trim();
    console.log("=== FRONTEND: Starting crawl ===");
    console.log("URL:", trimmedUrl);
    console.log("Type:", urlType);
    console.log("Bot ID:", bot.id);
    
    setUrl("");
    setCrawling(true);

    // Optimistically add as pending
    const tempId = `link-${Date.now()}`;
    const pendingLink: TrainingLink = { id: tempId, url: trimmedUrl, type: urlType, status: "pending", chars: 0 };
    setLinks(prev => [...prev, pendingLink]);

    try {
      console.log("Sending request to /api/ai-bots/crawl...");
      const res = await fetch("/api/ai-bots/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId: bot.id, url: trimmedUrl, type: urlType })
      });
      console.log("Response status:", res.status);
      
      const data = await res.json();
      console.log("Response data:", data);
      
      // Replace pending with real result
      setLinks(prev => prev.map(l => l.id === tempId ? data.link : l));
      
      if (data.error) {
        console.error("Crawl returned error:", data.error);
      } else {
        console.log("Crawl successful! Extracted chars:", data.extractedChars);
      }
    } catch (error) {
      console.error("=== FRONTEND: Crawl failed ===");
      console.error("Error:", error);
      setLinks(prev => prev.map(l => l.id === tempId ? { ...l, status: "failed" } : l));
    } finally {
      setCrawling(false);
      console.log("=== FRONTEND: Crawl complete ===");
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError("");
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("botId", bot.id);

    try {
      const res = await fetch("/api/ai-bots/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setLinks(prev => [...prev, data.link]);
    } catch (err: any) {
      setUploadError(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeLink(id: string) {
    const updated = links.filter(l => l.id !== id);
    setLinks(updated);
    onSave({ trainingLinks: updated });
  }

  const statusColor: Record<string, string> = { trained: "#10b981", pending: "#f59e0b", failed: "#ef4444", "no-space": "#6b7280" };

  return (
    <div style={{ padding: "32px" }} className="bot-panel-padding">
      <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>Links</h2>
      <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "24px" }}>Enter the link to a webpage and we will visit all the pages starting from it</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "24px" }} className="bot-links-grid">
        {/* Train from Link */}
        <div style={card}>
          <div style={{ fontWeight: 600, fontSize: "16px", marginBottom: "4px" }}>Train from Link</div>
          <p style={{ color: "#6b7280", fontSize: "13px", marginBottom: "16px" }}>Enter a URL to train your bot from a website or document</p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
            {["full-website", "webpage", "pdf", "word-doc", "excel-csv", "youtube", "vimeo", "loom"].map(t => (
              <button key={t} onClick={() => setUrlType(t)} style={{
                padding: "4px 12px", borderRadius: "20px", border: "1px solid", fontSize: "12px", cursor: "pointer", fontWeight: 500,
                background: urlType === t ? "#1f2937" : "#fff",
                color: urlType === t ? "#fff" : "#374151",
                borderColor: urlType === t ? "#1f2937" : "#d1d5db"
              }}>
                {t === "full-website" ? "Full Website" : t === "webpage" ? "Webpage" : t === "pdf" ? "PDF" : t === "word-doc" ? "Word Doc" : t === "excel-csv" ? "Excel/CSV" : t === "youtube" ? "YouTube" : t === "vimeo" ? "Vimeo" : "Loom"}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addLink()}
              placeholder={urlType === "youtube" ? "Enter YouTube URL" : urlType === "vimeo" ? "Enter Vimeo URL" : urlType === "loom" ? "Enter Loom URL" : "Enter the target link"}
              style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
              disabled={crawling}
            />
            <button onClick={addLink} disabled={crawling || !url.trim()} style={{ ...btnPrimary, opacity: crawling || !url.trim() ? 0.6 : 1, minWidth: "70px" }}>
              {crawling ? "..." : "Start"}
            </button>
          </div>
          {crawling && <div style={{ fontSize: "12px", color: "#f59e0b", marginTop: "8px" }}>⏳ Fetching and processing content...</div>}
        </div>

        {/* Upload Document */}
        <div style={card}>
          <div style={{ fontWeight: 600, fontSize: "16px", marginBottom: "4px" }}>Upload Document</div>
          <p style={{ color: "#6b7280", fontSize: "13px", marginBottom: "16px" }}>Only txt, pdf, docx, doc, csv, xlsx files are allowed. Max 70MB.</p>
          <div
            onClick={() => !uploading && fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file && fileRef.current) {
                const dt = new DataTransfer();
                dt.items.add(file);
                fileRef.current.files = dt.files;
                fileRef.current.dispatchEvent(new Event("change", { bubbles: true }));
              }
            }}
            style={{ border: "2px dashed #d1d5db", borderRadius: "10px", padding: "40px 20px", textAlign: "center", cursor: uploading ? "wait" : "pointer", color: "#6b7280", background: uploading ? "#f9fafb" : "#fff" }}
          >
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>{uploading ? "⏳" : "☁️"}</div>
            <div style={{ fontSize: "14px", fontWeight: 500 }}>{uploading ? "Processing file..." : "Choose a file or drag it here"}</div>
            <div style={{ fontSize: "12px", marginTop: "4px" }}>txt, pdf, docx, doc, csv, xlsx · Max 70MB</div>
          </div>
          {uploadError && <div style={{ fontSize: "12px", color: "#ef4444", marginTop: "8px" }}>⚠️ {uploadError}</div>}
          <input ref={fileRef} type="file" accept=".txt,.pdf,.docx,.doc,.csv,.xlsx" style={{ display: "none" }} onChange={handleFileUpload} />
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "10px", marginBottom: "20px" }} className="bot-stats-grid">
        {[
          { label: "Discovered Links", value: links.length, icon: "🔍" },
          { label: "Chars", value: `${totalChars.toLocaleString()} / ${(maxChars / 1000000).toFixed(0)}M`, icon: "📊" },
          { label: "Trained", value: links.filter(l => l.status === "trained").length, color: "#10b981" },
          { label: "Pending", value: links.filter(l => l.status === "pending").length, color: "#f59e0b" },
          { label: "Failed", value: links.filter(l => l.status === "failed").length, color: "#ef4444" },
          { label: "No Space", value: links.filter(l => l.status === "no-space").length, color: "#6b7280" },
        ].map(s => (
          <div key={s.label} style={{ background: "#fff", borderRadius: "8px", padding: "12px 16px", border: "1px solid #e5e7eb", textAlign: "center" }}>
            <div style={{ fontSize: "18px", fontWeight: 700, color: (s as any).color || "#1f2937" }}>{s.value}</div>
            <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {links.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "40px", color: "#9ca3af" }}>
          <div style={{ fontSize: "14px" }}>No links found. Add a URL above to start training.</div>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e5e7eb", overflow: "hidden" }}>
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "36px 120px 1fr 140px 100px 80px", alignItems: "center", padding: "10px 16px", background: "#f8fafc", borderBottom: "1px solid #e5e7eb" }}>
            <div />
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.08em", textTransform: "uppercase" }}>Status</div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.08em", textTransform: "uppercase" }}>Link / File</div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.08em", textTransform: "uppercase" }}>Character Count</div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.08em", textTransform: "uppercase" }}>Type</div>
            <div />
          </div>

          {/* Rows */}
          {links.map((link, idx) => {
            const isUrl = link.url.startsWith("http");
            const ext   = (link.originalName || link.url).split(".").pop()?.toLowerCase() || "";
            const name  = isUrl ? link.url : (link.originalName || decodeURIComponent(link.url.split("/").pop() || link.url));
            const statusDot: Record<string, string> = { trained: "#10b981", pending: "#f59e0b", failed: "#ef4444", "no-space": "#6b7280" };
            const statusLabel: Record<string, string> = { trained: "Done", pending: "Pending", failed: "Failed", "no-space": "No Space" };

            return (
              <div key={link.id} style={{ display: "grid", gridTemplateColumns: "36px 120px 1fr 140px 100px 80px", alignItems: "center", padding: "12px 16px", borderBottom: idx < links.length - 1 ? "1px solid #f3f4f6" : "none", background: "#fff" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#f8fafc")}
                onMouseLeave={e => (e.currentTarget.style.background = "#fff")}>

                {/* Checkbox */}
                <input type="checkbox" style={{ cursor: "pointer" }} />

                {/* Status */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${statusDot[link.status] || "#9ca3af"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {link.status === "trained" && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", display: "block" }} />}
                  </span>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: statusDot[link.status] || "#6b7280" }}>{statusLabel[link.status] || link.status}</span>
                </div>

                {/* Link / File */}
                <div style={{ minWidth: 0, paddingRight: "16px" }}>
                  {isUrl ? (
                    <a href={link.url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: "13px", color: "#2563eb", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}
                      onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                      onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}>
                      {name}
                    </a>
                  ) : (
                    <a href={link.url} download={link.originalName || name}
                      style={{ fontSize: "13px", color: "#374151", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "6px" }}>
                      <span>{ext === "pdf" ? "📄" : ext === "docx" || ext === "doc" ? "📝" : ext === "xlsx" || ext === "csv" ? "📊" : "📎"}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                    </a>
                  )}
                </div>

                {/* Char count */}
                <div style={{ fontSize: "13px", color: "#374151" }}>{(link.chars || 0).toLocaleString()}</div>

                {/* Type */}
                <div style={{ fontSize: "12px", color: "#6b7280", textTransform: "capitalize" }}>{link.type}</div>

                {/* Delete */}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={() => removeLink(link.id)}
                    style={{ width: 28, height: 28, borderRadius: "6px", background: "none", border: "1px solid #e5e7eb", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: "14px" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#fff5f5"; e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.borderColor = "#fecaca"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#9ca3af"; e.currentTarget.style.borderColor = "#e5e7eb"; }}>
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Text Panel ───────────────────────────────────────────────────────────────

function TextPanel({ bot, onSave, saving }: { bot: AiBot; onSave: (u: Partial<AiBot>) => void; saving: boolean }) {
  const [text, setText] = useState(bot.trainingText || "");
  const { saved, flash } = useSaved();

  return (
    <div style={{ padding: "32px" }} className="bot-panel-padding">
      <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>Text</h2>
      <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "24px" }}>This is a quick and easy method to quickly train your chatbot on extra data. Simply add any text below.</p>
      <div style={card}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Enter your training content here..."
          style={{ width: "100%", minHeight: "400px", border: "none", outline: "none", fontSize: "14px", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #f3f4f6" }}>
          <span style={{ fontSize: "12px", color: "#9ca3af" }}>{text.length.toLocaleString()} characters</span>
          <button onClick={() => { onSave({ trainingText: text }); flash(); }} disabled={saving} style={btnPrimary}>
            {saving ? "Saving..." : "Save"}
          </button>
          <SavedBadge visible={saved} />
        </div>
      </div>
    </div>
  );
}

// ─── Q&A Panel ────────────────────────────────────────────────────────────────

function QAPanel({ bot, onSave, saving }: { bot: AiBot; onSave: (u: Partial<AiBot>) => void; saving: boolean }) {
  const [items, setItems] = useState<QAItem[]>(bot.qaItems || []);
  const { saved, flash } = useSaved();

  function addItem() {
    setItems(prev => [...prev, { id: `qa-${Date.now()}`, question: "", answer: "" }]);
  }

  function updateItem(id: string, field: "question" | "answer", value: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  }

  function removeItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id));
  }

  function save() {
    onSave({ qaItems: items });
    flash();
  }

  return (
    <div style={{ padding: "32px" }} className="bot-panel-padding">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }} className="bot-qa-header">
        <div>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>Q&A</h2>
          <p style={{ color: "#6b7280", fontSize: "14px", margin: 0 }}>Use this section to add frequently asked questions and the responses the chatbot should provide.</p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={addItem} style={btnPrimary}>+ Add</button>
          <button onClick={save} disabled={saving} style={btnSecondary}>{saving ? "Saving..." : "Save"}</button>
          <SavedBadge visible={saved} />
        </div>
      </div>

      {items.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "60px", color: "#9ca3af" }}>
          <div style={{ fontSize: "14px" }}>No Q&A pairs yet. Click "+ Add" to create one.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {items.map(item => (
            <div key={item.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontWeight: 600, fontSize: "13px", color: "#374151" }}>Question</span>
                <button onClick={() => removeItem(item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: "14px" }}>🗑</button>
              </div>
              <input
                value={item.question}
                onChange={e => updateItem(item.id, "question", e.target.value)}
                placeholder="Enter Question"
                style={{ ...inputStyle, marginBottom: "10px" }}
              />
              <textarea
                value={item.answer}
                onChange={e => updateItem(item.id, "answer", e.target.value)}
                placeholder="Enter Answer"
                style={{ ...inputStyle, minHeight: "80px", resize: "vertical" } as any}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Courses Panel ────────────────────────────────────────────────────────────

type Course = {
  id: string;
  title: string;
  folders?: { id: string; title: string }[];
  pages?: { id: string; title: string; folderId?: string; transcript?: string }[];
};

function CoursesPanel({ bot, onSave, saving }: { bot: AiBot; onSave: (u: Partial<AiBot>) => void; saving: boolean }) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set(bot.selectedPages || []));
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set(bot.selectedFolders || []));
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set(bot.selectedCourses || []));
  const { saved, flash } = useSaved();

  useEffect(() => {
    fetch("/api/courses").then(r => r.ok ? r.json() : []).then(data => {
      setCourses(data); setLoading(false);
    });
  }, []);

  function toggleCourse(courseId: string, course: Course) {
    const allPageIds = (course.pages || []).map((p: any) => p.id);
    const allFolderIds = (course.folders || []).map((f: any) => f.id);
    const newCourses = new Set(selectedCourses);
    const newFolders = new Set(selectedFolders);
    const newPages = new Set(selectedPages);

    if (newCourses.has(courseId)) {
      newCourses.delete(courseId);
      allFolderIds.forEach(id => newFolders.delete(id));
      allPageIds.forEach(id => newPages.delete(id));
    } else {
      newCourses.add(courseId);
      allFolderIds.forEach(id => newFolders.add(id));
      allPageIds.forEach(id => newPages.add(id));
    }
    setSelectedCourses(newCourses); setSelectedFolders(newFolders); setSelectedPages(newPages);
  }

  function toggleFolder(folderId: string, course: Course) {
    const folderPages = (course.pages || []).filter((p: any) => p.folderId === folderId).map((p: any) => p.id);
    const newFolders = new Set(selectedFolders);
    const newPages = new Set(selectedPages);

    if (newFolders.has(folderId)) {
      newFolders.delete(folderId);
      folderPages.forEach(id => newPages.delete(id));
    } else {
      newFolders.add(folderId);
      folderPages.forEach(id => newPages.add(id));
    }
    setSelectedFolders(newFolders); setSelectedPages(newPages);
  }

  function togglePage(pageId: string) {
    const newPages = new Set(selectedPages);
    newPages.has(pageId) ? newPages.delete(pageId) : newPages.add(pageId);
    setSelectedPages(newPages);
  }

  function save() {
    console.log('[Master Bot Courses] Saving course selections:', {
      selectedCourses: Array.from(selectedCourses),
      selectedFolders: Array.from(selectedFolders),
      selectedPages: Array.from(selectedPages),
    });
    onSave({
      selectedCourses: Array.from(selectedCourses),
      selectedFolders: Array.from(selectedFolders),
      selectedPages: Array.from(selectedPages),
    });
    flash();
  }

  const totalSelected = selectedPages.size;

  return (
    <div style={{ padding: "32px" }} className="bot-panel-padding">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
        <div>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>Courses</h2>
          <p style={{ color: "#6b7280", fontSize: "14px", margin: 0 }}>Select courses, modules, and lessons to train this bot</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {totalSelected > 0 && <span style={{ fontSize: "13px", color: "#6b7280" }}>{totalSelected} lessons selected</span>}
          <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? "Saving..." : "Save & Train"}</button>
          <SavedBadge visible={saved} />
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#9ca3af" }}>Loading courses...</div>
      ) : courses.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "60px", color: "#9ca3af" }}>No courses found</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {courses.map(course => {
            const isExpanded = expanded.has(course.id);
            const isCourseChecked = selectedCourses.has(course.id);
            const coursePageCount = (course.pages || []).length;
            const selectedInCourse = (course.pages || []).filter(p => selectedPages.has(p.id)).length;

            return (
              <div key={course.id} style={{ ...card, padding: 0, overflow: "hidden" }}>
                {/* Course header */}
                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 20px", background: "#f8fafc", borderBottom: isExpanded ? "1px solid #e5e7eb" : "none" }}>
                  <input type="checkbox" checked={isCourseChecked} onChange={() => toggleCourse(course.id, course)}
                    style={{ width: 16, height: 16, accentColor: "#3b82f6", cursor: "pointer", flexShrink: 0 }} />
                  <button onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(course.id) ? n.delete(course.id) : n.add(course.id); return n; })}
                    style={{ background: "none", border: "none", cursor: "pointer", flex: 1, textAlign: "left", display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "18px" }}>📚</span>
                    <span style={{ fontWeight: 700, fontSize: "15px", color: "#1f2937" }}>{course.title}</span>
                    <span style={{ fontSize: "12px", color: "#9ca3af", marginLeft: "auto" }}>{selectedInCourse}/{coursePageCount} lessons</span>
                    <span style={{ color: "#9ca3af", fontSize: "12px" }}>{isExpanded ? "▲" : "▼"}</span>
                  </button>
                </div>

                {/* Folders + Pages */}
                {isExpanded && (
                  <div style={{ padding: "8px 0" }}>
                    {/* Pages without folder */}
                    {(course.pages || []).filter(p => !p.folderId).map(page => (
                      <label key={page.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 20px 8px 44px", cursor: "pointer" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <input type="checkbox" checked={selectedPages.has(page.id)} onChange={() => togglePage(page.id)}
                          style={{ width: 14, height: 14, accentColor: "#3b82f6", cursor: "pointer" }} />
                        <span style={{ fontSize: "14px" }}>📄</span>
                        <span style={{ fontSize: "13px", color: "#374151" }}>{page.title}</span>
                        {page.transcript && <span style={{ fontSize: "11px", color: "#10b981", marginLeft: "auto" }}>✓ transcript</span>}
                      </label>
                    ))}

                    {/* Folders */}
                    {(course.folders || []).map(folder => {
                      const folderPages = (course.pages || []).filter(p => p.folderId === folder.id);
                      const isFolderChecked = selectedFolders.has(folder.id);
                      return (
                        <div key={folder.id}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 20px 8px 28px" }}>
                            <input type="checkbox" checked={isFolderChecked} onChange={() => toggleFolder(folder.id, course)}
                              style={{ width: 15, height: 15, accentColor: "#3b82f6", cursor: "pointer" }} />
                            <span style={{ fontSize: "15px" }}>📁</span>
                            <span style={{ fontWeight: 600, fontSize: "13px", color: "#374151" }}>{folder.title}</span>
                            <span style={{ fontSize: "11px", color: "#9ca3af" }}>({folderPages.filter(p => selectedPages.has(p.id)).length}/{folderPages.length})</span>
                          </div>
                          {folderPages.map(page => (
                            <label key={page.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "7px 20px 7px 60px", cursor: "pointer" }}
                              onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                              <input type="checkbox" checked={selectedPages.has(page.id)} onChange={() => togglePage(page.id)}
                                style={{ width: 14, height: 14, accentColor: "#3b82f6", cursor: "pointer" }} />
                              <span style={{ fontSize: "13px" }}>📄</span>
                              <span style={{ fontSize: "13px", color: "#374151" }}>{page.title}</span>
                              {page.transcript && <span style={{ fontSize: "11px", color: "#10b981", marginLeft: "auto" }}>✓ transcript</span>}
                            </label>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tune AI Panel ────────────────────────────────────────────────────────────

const DEFAULT_PROMPTS: Record<string, string> = {
  "General Customer Service": `Chatbot Role and Function\n\nYou are a customer service chatbot for [Company Name]. Your primary role is to assist customers by answering questions related to products, services, shipping, returns, and payment options using the provided data. When asked about product details, shipping times, or return policies, respond based on the available information. If the necessary details are not covered in the provided data, respond with:\n\n"Apologies, I do not have that information. Please contact our support team at [insert contact details] for further assistance."\n\nGuidelines and Restrictions\n\nData Reliance: Only use the provided data to answer questions. Do not explicitly mention users that you are relying on this data.\nStay Focused: If users try to divert the conversation to unrelated topics, politely redirect them to queries relevant to customer service and sales.`,
};

function TunePanel({ bot, onSave, saving }: { bot: AiBot; onSave: (u: Partial<AiBot>) => void; saving: boolean }) {
  const [model, setModel] = useState(bot.model || "gpt-4o-mini");
  const [creativity, setCreativity] = useState(bot.creativity || 0);
  const [systemPrompt, setSystemPrompt] = useState(bot.systemPrompt || "");
  const [selectedPreset, setSelectedPreset] = useState("General Customer Service");
  const { saved: tuneSaved, flash: tuneFlash } = useSaved();

  function applyPreset(preset: string) {
    setSelectedPreset(preset);
    setSystemPrompt(DEFAULT_PROMPTS[preset] || "");
  }

  return (
    <div style={{ padding: "32px" }} className="bot-panel-padding">
      <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "24px" }}>Tune AI</h2>

      {/* Model Selection */}
      <div style={{ ...card, marginBottom: "20px" }}>
        <div style={{ fontWeight: 600, marginBottom: "16px" }}>Model</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }} className="bot-tune-model-grid">
          <div>
            <label style={{ fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "6px" }}>OpenAI Models</label>
            <select value={model} onChange={e => setModel(e.target.value)} style={inputStyle}>
              <option value="gpt-4o-mini">GPT-4o mini</option>
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
            </select>
          </div>
        </div>
      </div>

      {/* AI Creativity */}
      <div style={{ ...card, marginBottom: "20px" }}>
        <div style={{ fontWeight: 600, marginBottom: "4px" }}>AI Creativity</div>
        <p style={{ color: "#6b7280", fontSize: "13px", marginBottom: "16px" }}>Lower values make responses more focused and predictable. Higher values make them more creative and varied.</p>
        <input
          type="range" min={0} max={100} value={creativity}
          onChange={e => setCreativity(Number(e.target.value))}
          style={{ width: "100%", accentColor: "#1f2937" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
          <span>0%</span><span style={{ fontWeight: 600, color: "#1f2937" }}>{creativity}%</span><span>100%</span>
        </div>
      </div>

      {/* AI Instruction Prompt */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>AI Instruction Prompt</div>
            <p style={{ color: "#6b7280", fontSize: "13px", margin: 0 }}>Give instructions here to tune the behaviour of the bot. You can simply explain how you want the bot to behave.</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
          <select value={selectedPreset} onChange={e => applyPreset(e.target.value)} style={{ ...inputStyle, marginBottom: 0, flex: 1 }}>
            {Object.keys(DEFAULT_PROMPTS).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button onClick={() => applyPreset(selectedPreset)} style={btnSecondary}>Load Preset</button>
        </div>
        <textarea
          value={systemPrompt}
          onChange={e => setSystemPrompt(e.target.value)}
          placeholder="Enter your AI instructions here..."
          style={{ ...inputStyle, minHeight: "200px", resize: "vertical" } as any}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "10px", marginTop: "12px" }}>
          <SavedBadge visible={tuneSaved} />
          <button onClick={() => { onSave({ model, creativity, systemPrompt }); tuneFlash(); }} disabled={saving} style={btnPrimary}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Test Your Bot Panel ──────────────────────────────────────────────────────

function TestPanel({ bot }: { bot: AiBot }) {
  type Attachment = { name: string; url: string; type: string };
  type Msg = { role: "user" | "assistant"; content: string; attachments?: Attachment[] };
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const color = (bot as any).colorTheme || "#3b82f6";

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    setMessages([{ role: "assistant", content: (bot as any).welcomeMessage || "Hi, How can I help you today?" }]);
  }, [bot.id]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAttachments(prev => [...prev, { name: file.name, url: reader.result as string, type: file.type }]);
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function send() {
    if ((!input.trim() && attachments.length === 0) || loading) return;
    const userMsg: Msg = { role: "user", content: input.trim(), attachments: attachments.length > 0 ? [...attachments] : undefined };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages); setInput(""); setAttachments([]);
    setLoading(true);
    try {
      const res = await fetch("/api/ai-bots/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId: bot.id, messages: newMessages.map(m => ({ role: m.role, content: m.content })) })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.message || data.error || "Error" }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Failed to get response." }]);
    } finally { setLoading(false); }
  }

  const avatar = (bot as any).botAvatarUrl
    ? <img src={(bot as any).botAvatarUrl} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    : <span style={{ fontSize: "16px" }}>🤖</span>;

  return (
    <div style={{ padding: "32px", height: "100%", display: "flex", flexDirection: "column" }} className="bot-panel-padding">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>Test Your Bot</h2>
          <p style={{ color: "#6b7280", fontSize: "14px", margin: 0 }}>Here you can use your chatbot and compare AI models to see which gives you the best responses.</p>
        </div>
        <button onClick={() => { setMessages([{ role: "assistant", content: (bot as any).welcomeMessage || "Hi, How can I help you today?" }]); setAttachments([]); }} style={btnSecondary}>Clear all chats</button>
      </div>

      <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
        <div style={{ width: "100%", maxWidth: "520px", borderRadius: "16px", overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.10)", border: "1px solid #e5e7eb", background: "#fff", display: "flex", flexDirection: "column", height: "calc(100vh - 220px)", minHeight: "600px" }}>
          <div style={{ background: color, padding: "12px 16px", display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>{avatar}</div>
            <span style={{ color: "#fff", fontWeight: 600, fontSize: "15px", flex: 1 }}>{(bot as any).botTitle || bot.name}</span>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "12px", background: "#f8fafc" }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", alignItems: "flex-end", gap: "8px" }}>
                {m.role === "assistant" && (
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>{avatar}</div>
                )}
                <div style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start", gap: "6px", maxWidth: "72%" }}>
                  {m.attachments && m.attachments.length > 0 && (
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                      {m.attachments.map((att, ai) => (
                        <div key={ai} style={{ padding: "5px 10px", background: m.role === "user" ? "rgba(255,255,255,0.2)" : "#f3f4f6", borderRadius: "8px", fontSize: "12px", color: m.role === "user" ? "#fff" : "#374151", display: "flex", alignItems: "center", gap: "5px" }}>
                          {att.type.startsWith("image/") ? <img src={att.url} alt={att.name} style={{ width: 36, height: 36, objectFit: "cover", borderRadius: "4px" }} /> : <span>📎</span>}
                          <span style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {m.content && (
                    <div style={{ padding: "10px 14px", borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", fontSize: "16px", lineHeight: "1.6", background: m.role === "user" ? color : "#fff", color: m.role === "user" ? "#fff" : "#1f2937", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>{m.content}</div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "flex-end", gap: "8px" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>{avatar}</div>
                <div style={{ padding: "10px 14px", borderRadius: "16px 16px 16px 4px", background: "#fff", color: "#6b7280", fontSize: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>Thinking...</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Attachment preview */}
          {attachments.length > 0 && (
            <div style={{ padding: "8px 16px", borderTop: "1px solid #f3f4f6", display: "flex", gap: "8px", flexWrap: "wrap", background: "#fff" }}>
              {attachments.map((att, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "5px 10px", background: "#f3f4f6", borderRadius: "8px", fontSize: "12px" }}>
                  {att.type.startsWith("image/") ? <img src={att.url} alt={att.name} style={{ width: 32, height: 32, objectFit: "cover", borderRadius: "4px" }} /> : <span>📎</span>}
                  <span style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</span>
                  <button onClick={() => setAttachments(prev => prev.filter((_,idx) => idx !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: "16px", padding: 0, lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ padding: "12px 16px", borderTop: "1px solid #e5e7eb", display: "flex", gap: "8px", alignItems: "center", background: "#fff" }}>
            <input ref={fileRef} type="file" accept="image/*,.pdf,.docx,.doc,.txt,.csv,.xlsx" style={{ display: "none" }} onChange={handleFile} />
            <button onClick={() => fileRef.current?.click()} title="Attach file"
              style={{ width: 34, height: 34, borderRadius: "50%", border: "none", background: "#f3f4f6", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", flexShrink: 0 }}>+</button>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
              placeholder={(bot as any).placeholder || "Ask me anything..."}
              style={{ ...inputStyle, flex: 1, marginBottom: 0, borderRadius: "20px", padding: "10px 16px" }} />
            <button onClick={send} disabled={loading || (!input.trim() && attachments.length === 0)}
              style={{ width: 40, height: 40, borderRadius: "50%", background: color, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: loading || (!input.trim() && attachments.length === 0) ? 0.5 : 1, flexShrink: 0 }}>
              <span style={{ color: "#fff", fontSize: "16px" }}>➤</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Appearance Panel ─────────────────────────────────────────────────────────

const COLOR_THEMES = ["#3b82f6","#1f2937","#7c3aed","#0f766e","#15803d","#ca8a04","#ea580c","#dc2626","#be185d","#9333ea"];

// Maps sound name → Web Audio API tone sequence: [frequency, duration][]
function playAttentionSound(sound: string) {
  if (sound === "None" || typeof window === "undefined") return;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const sequences: Record<string, [number, number][]> = {
      Chime:  [[523, 0.12], [659, 0.12], [784, 0.2]],
      Bell:   [[880, 0.05], [880, 0.3]],
      Pop:    [[400, 0.04], [600, 0.08]],
      Ding:   [[1047, 0.25]],
    };
    const seq = sequences[sound] || sequences["Ding"];
    let t = ctx.currentTime;
    seq.forEach(([freq, dur]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t);
      osc.stop(t + dur);
      t += dur + 0.02;
    });
  } catch { /* ignore if AudioContext not available */ }
}

// CSS animation name for each option
const ANIMATION_MAP: Record<string, string> = {
  Bounce: "ag-bounce",
  Pulse:  "ag-pulse",
  Shake:  "ag-shake",
  Wiggle: "ag-wiggle",
};

function ChatPreview({ botTitle, welcomeMessage, suggestions, placeholder, colorTheme, avatarPreview, chatIconSize, showWelcomePopup, attentionAnimation, attentionSound }: {
  botTitle: string; welcomeMessage: string; suggestions: string[]; placeholder: string;
  colorTheme: string; avatarPreview: string; chatIconSize: number; showWelcomePopup: boolean;
  attentionAnimation: string; attentionSound: string;
}) {
  // Play sound whenever attentionSound changes (and isn't None)
  useEffect(() => {
    if (attentionSound !== "None") playAttentionSound(attentionSound);
  }, [attentionSound]);

  const animClass = ANIMATION_MAP[attentionAnimation] || "";

  const avatar = avatarPreview
    ? <img src={avatarPreview} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    : <span style={{ fontSize: "16px" }}>🤖</span>;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "12px", userSelect: "none" }}>
      {/* Chat window */}
      <div style={{ width: "300px", borderRadius: "16px", overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.18)", border: "1px solid #e5e7eb", background: "#fff", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ background: colorTheme, padding: "14px 16px", display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
            {avatar}
          </div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: "14px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {botTitle || "My Bot"}
          </div>
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "18px", cursor: "pointer" }}>✕</div>
        </div>

        {/* Messages area */}
        <div style={{ flex: 1, padding: "16px", background: "#f9fafb", display: "flex", flexDirection: "column", gap: "10px", minHeight: "200px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: colorTheme, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, fontSize: "13px" }}>
              {avatarPreview ? <img src={avatarPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🤖"}
            </div>
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", padding: "9px 12px", borderRadius: "4px 14px 14px 14px", fontSize: "13px", color: "#1f2937", maxWidth: "200px", lineHeight: "1.5", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              {welcomeMessage || "Hi, How can I help you today?"}
            </div>
          </div>
          {suggestions.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginLeft: "36px" }}>
              {suggestions.slice(0, 3).map((s, i) => (
                <span key={i} style={{ padding: "4px 10px", border: `1px solid ${colorTheme}`, borderRadius: "20px", fontSize: "11px", color: colorTheme, background: "#fff", cursor: "pointer" }}>{s}</span>
              ))}
            </div>
          )}
        </div>

        {/* Input bar */}
        <div style={{ padding: "10px 12px", borderTop: "1px solid #e5e7eb", background: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ flex: 1, padding: "8px 12px", background: "#f3f4f6", borderRadius: "20px", fontSize: "12px", color: "#9ca3af" }}>
            {placeholder || "Ask me anything..."}
          </div>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: colorTheme, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "14px", flexShrink: 0 }}>➤</div>
        </div>
      </div>

      {/* Launcher + popup */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
        {showWelcomePopup && (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "10px 14px", fontSize: "12px", color: "#374151", maxWidth: "220px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", lineHeight: "1.5" }}>
            {welcomeMessage || "Hi, How can I help you today?"}
          </div>
        )}

        {/* Animated launcher button */}
        <div
          className={animClass || undefined}
          style={{ width: chatIconSize, height: chatIconSize, borderRadius: "50%", background: colorTheme, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(0,0,0,0.2)", overflow: "hidden", cursor: "pointer" }}
        >
          {avatarPreview ? <img src={avatarPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: Math.round(chatIconSize * 0.4) + "px" }}>🤖</span>}
        </div>

        {/* Animation label badge */}
        {attentionAnimation !== "None" && (
          <div style={{ fontSize: "10px", color: "#6b7280", background: "#f3f4f6", padding: "2px 8px", borderRadius: "10px" }}>
            ▶ {attentionAnimation}
          </div>
        )}
      </div>

      <style>{`
        @keyframes ag-bounce {
          0%, 100% { transform: translateY(0); }
          30% { transform: translateY(-14px); }
          60% { transform: translateY(-6px); }
        }
        @keyframes ag-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 4px 16px rgba(0,0,0,0.2); }
          50% { transform: scale(1.15); box-shadow: 0 6px 24px rgba(0,0,0,0.3); }
        }
        @keyframes ag-shake {
          0%, 100% { transform: rotate(0deg); }
          15% { transform: rotate(-12deg); }
          30% { transform: rotate(12deg); }
          45% { transform: rotate(-8deg); }
          60% { transform: rotate(8deg); }
          75% { transform: rotate(-4deg); }
          90% { transform: rotate(4deg); }
        }
        @keyframes ag-wiggle {
          0%, 100% { transform: rotate(0deg) scale(1); }
          25% { transform: rotate(-8deg) scale(1.05); }
          75% { transform: rotate(8deg) scale(1.05); }
        }
        .ag-bounce { animation: ag-bounce 1s ease infinite; }
        .ag-pulse  { animation: ag-pulse  1.5s ease infinite; }
        .ag-shake  { animation: ag-shake  0.8s ease infinite; }
        .ag-wiggle { animation: ag-wiggle 0.6s ease infinite; }
      `}</style>
    </div>
  );
}

function AppearancePanel({ bot, onSave, saving }: { bot: AiBot; onSave: (u: Partial<AiBot>) => void; saving: boolean }) {
  const [botTitle, setBotTitle] = useState(bot.botTitle || bot.name || "");
  const [displayMessage, setDisplayMessage] = useState(bot.displayMessage || "");
  const [displayMessageEnabled, setDisplayMessageEnabled] = useState(bot.displayMessageEnabled ?? false);
  const [welcomeMessage, setWelcomeMessage] = useState(bot.welcomeMessage || "Hi, How can I help you today?");
  const [welcomeEnabled, setWelcomeEnabled] = useState(true);
  const [showWelcomePopup, setShowWelcomePopup] = useState(bot.showWelcomePopup ?? true);
  const [suggestions, setSuggestions] = useState<string[]>(bot.suggestions || []);
  const [suggestionsEnabled, setSuggestionsEnabled] = useState(true);
  const [removeSuggestionsAfterFirst, setRemoveSuggestionsAfterFirst] = useState(bot.removeSuggestionsAfterFirst ?? false);
  const [placeholder, setPlaceholder] = useState(bot.placeholder || "Ask me anything...");
  const [placeholderEnabled, setPlaceholderEnabled] = useState(true);
  const [leadCollection, setLeadCollection] = useState(bot.leadCollection ?? false);
  const [privacyPolicyEnabled, setPrivacyPolicyEnabled] = useState(bot.privacyPolicyEnabled ?? true);
  const [privacyActionText, setPrivacyActionText] = useState(bot.privacyActionText || "Read our");
  const [privacyLinkText, setPrivacyLinkText] = useState(bot.privacyLinkText || "Privacy Policy");
  const [privacyLink, setPrivacyLink] = useState(bot.privacyLink || "https://yoursite.com/privacy");
  const [colorTheme, setColorTheme] = useState(bot.colorTheme || "#3b82f6");
  const [chatIconSize, setChatIconSize] = useState(bot.chatIconSize || 60);
  const [enterMessage, setEnterMessage] = useState(bot.enterMessage || "Chat Now");
  const [attentionSound, setAttentionSound] = useState(bot.attentionSound || "None");
  const [attentionAnimation, setAttentionAnimation] = useState(bot.attentionAnimation || "None");
  const [immediatelyOpenChat, setImmediatelyOpenChat] = useState(bot.immediatelyOpenChat ?? false);
  const avatarRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState(bot.botAvatarUrl || "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const { saved: appearSaved, flash: appearFlash } = useSaved();

  // Re-sync ONLY when switching to a different bot (not after save of same bot)
  const prevBotIdRef = useRef<string>("");
  useEffect(() => {
    if (prevBotIdRef.current === bot.id) return; // same bot — don't overwrite user edits
    prevBotIdRef.current = bot.id;
    setBotTitle(bot.botTitle || bot.name || "");
    setDisplayMessage(bot.displayMessage || "");
    setDisplayMessageEnabled(bot.displayMessageEnabled ?? false);
    setWelcomeMessage(bot.welcomeMessage || "Hi, How can I help you today?");
    setShowWelcomePopup(bot.showWelcomePopup ?? true);
    setSuggestions(bot.suggestions || []);
    setRemoveSuggestionsAfterFirst(bot.removeSuggestionsAfterFirst ?? false);
    setPlaceholder(bot.placeholder || "Ask me anything...");
    setLeadCollection(bot.leadCollection ?? false);
    setPrivacyPolicyEnabled(bot.privacyPolicyEnabled ?? true);
    setPrivacyActionText(bot.privacyActionText || "Read our");
    setPrivacyLinkText(bot.privacyLinkText || "Privacy Policy");
    setPrivacyLink(bot.privacyLink || "https://yoursite.com/privacy");
    setColorTheme(bot.colorTheme || "#3b82f6");
    setChatIconSize(bot.chatIconSize || 60);
    setEnterMessage(bot.enterMessage || "Chat Now");
    setAttentionSound(bot.attentionSound || "None");
    setAttentionAnimation(bot.attentionAnimation || "None");
    setImmediatelyOpenChat(bot.immediatelyOpenChat ?? false);
    setAvatarPreview(bot.botAvatarUrl || "");
    setAvatarFile(null);
  }, [bot.id]);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
    if (avatarRef.current) avatarRef.current.value = "";
  }

  async function save() {
    let finalAvatarUrl = bot.botAvatarUrl || "";

    // Upload avatar to /uploads if a new file was selected
    if (avatarFile) {
      setUploadingAvatar(true);
      try {
        const fd = new FormData();
        fd.append("file", avatarFile);
        const res = await fetch("/api/ai-bots/upload-avatar", { method: "POST", body: fd });
        if (res.ok) {
          const data = await res.json();
          finalAvatarUrl = data.url;
          setAvatarPreview(finalAvatarUrl);
          setAvatarFile(null);
        }
      } finally {
        setUploadingAvatar(false);
      }
    }

    onSave({
      botTitle, displayMessage, displayMessageEnabled, welcomeMessage, showWelcomePopup,
      placeholder, suggestions, removeSuggestionsAfterFirst, colorTheme, leadCollection,
      privacyPolicyEnabled, privacyActionText, privacyLinkText, privacyLink,
      chatIconSize, enterMessage, attentionSound, attentionAnimation, immediatelyOpenChat,
      botAvatarUrl: finalAvatarUrl
    });
  }

  const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" };
  const sectionLabel: React.CSSProperties = { fontWeight: 600, fontSize: "15px" };
  const sectionSub: React.CSSProperties = { fontSize: "12px", color: "#6b7280", marginTop: "2px" };

  return (
    <div style={{ padding: "32px" }} className="bot-panel-padding">
      <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>Appearance</h2>
      <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "28px" }}>Customize the look and feel of your chatbot interface here.</p>

      <div style={{ display: "flex", gap: "32px", alignItems: "flex-start" }} className="bot-appearance-layout">

        {/* ── Left: Settings form ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: "#e5e7eb", borderRadius: "12px", overflow: "hidden", border: "1px solid #e5e7eb" }}>

        {/* Display Message */}
        <div style={{ background: "#fff", padding: "18px 20px" }}>
          <div style={rowStyle}>
            <div><div style={sectionLabel}>Display Message</div><div style={sectionSub}>To be shown in the response output</div></div>
            <Toggle value={displayMessageEnabled} onChange={setDisplayMessageEnabled} />
          </div>
          {displayMessageEnabled && <input value={displayMessage} onChange={e => setDisplayMessage(e.target.value)} style={{ ...inputStyle, marginTop: "10px" }} placeholder="Enter display message..." />}
        </div>

        {/* Welcome Message */}
        <div style={{ background: "#fff", padding: "18px 20px" }}>
          <div style={rowStyle}>
            <div><div style={sectionLabel}>Welcome Message</div><div style={sectionSub}>The introductory message from the chatbot</div></div>
            <Toggle value={welcomeEnabled} onChange={setWelcomeEnabled} />
          </div>
          {welcomeEnabled && <input value={welcomeMessage} onChange={e => setWelcomeMessage(e.target.value)} style={{ ...inputStyle, marginTop: "10px" }} placeholder="Hi, How can I help you today?" />}
        </div>

        {/* Suggestions */}
        <div style={{ background: "#fff", padding: "18px 20px" }}>
          <div style={rowStyle}>
            <div><div style={sectionLabel}>Suggestions</div><div style={sectionSub}>Questions to be shown to user (1 suggestion per line)</div></div>
            <Toggle value={suggestionsEnabled} onChange={setSuggestionsEnabled} />
          </div>
          {suggestionsEnabled && (
            <>
              <textarea
                value={suggestions.join("\n")}
                onChange={e => setSuggestions(e.target.value.split("\n"))}
                placeholder={"Tesla Cost?\nHow much is an ID3?"}
                rows={4}
                style={{ ...inputStyle, marginTop: "10px", resize: "vertical", fontFamily: "inherit" }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", cursor: "pointer", fontSize: "13px", color: "#374151", background: "#fffbeb", padding: "10px 12px", borderRadius: "8px" }}>
                <input type="checkbox" checked={removeSuggestionsAfterFirst} onChange={e => setRemoveSuggestionsAfterFirst(e.target.checked)} style={{ accentColor: "#3b82f6" }} />
                Remove Suggestion List after first User message is sent
              </label>
            </>
          )}
        </div>

        {/* Placeholder */}
        <div style={{ background: "#fff", padding: "18px 20px" }}>
          <div style={rowStyle}>
            <div><div style={sectionLabel}>Placeholder</div><div style={sectionSub}>To be shown in the query input</div></div>
            <Toggle value={placeholderEnabled} onChange={setPlaceholderEnabled} />
          </div>
          {placeholderEnabled && <input value={placeholder} onChange={e => setPlaceholder(e.target.value)} style={{ ...inputStyle, marginTop: "10px" }} placeholder="Ask me anything..." />}
        </div>

        {/* Lead Collection */}
        <div style={{ background: "#fff", padding: "18px 20px" }}>
          <div style={rowStyle}>
            <div><div style={sectionLabel}>Lead Collection</div><div style={sectionSub}>Collect leads before or during a conversation</div></div>
            <Toggle value={leadCollection} onChange={setLeadCollection} />
          </div>
        </div>

        {/* Privacy Policy */}
        <div style={{ background: "#fff", padding: "18px 20px" }}>
          <div style={rowStyle}>
            <div><div style={sectionLabel}>Privacy Policy</div><div style={sectionSub}>Add privacy policy link to your chat widget</div></div>
            <Toggle value={privacyPolicyEnabled} onChange={setPrivacyPolicyEnabled} />
          </div>
          {privacyPolicyEnabled && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: "10px", marginTop: "12px" }} className="bot-tune-model-grid">
              <div>
                <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "4px" }}>Action text</div>
                <input value={privacyActionText} onChange={e => setPrivacyActionText(e.target.value)} style={inputStyle} placeholder="Read our" />
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "4px" }}>Link text</div>
                <input value={privacyLinkText} onChange={e => setPrivacyLinkText(e.target.value)} style={inputStyle} placeholder="Privacy Policy" />
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "4px" }}>Link</div>
                <input value={privacyLink} onChange={e => setPrivacyLink(e.target.value)} style={inputStyle} placeholder="https://yoursite.com/privacy" />
              </div>
            </div>
          )}
        </div>

        {/* Branding */}
        <div style={{ background: "#fff", padding: "18px 20px" }}>
          <div style={{ fontWeight: 600, fontSize: "15px", marginBottom: "4px" }}>Branding</div>
          <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "16px" }}>Upload your avatar and set colors</div>
          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "flex-start" }}>
            {/* Avatar upload */}
            <div style={{ textAlign: "center" }}>
              <div
                onClick={() => avatarRef.current?.click()}
                style={{ width: 80, height: 80, borderRadius: "50%", background: avatarPreview ? "transparent" : "#f3f4f6", border: avatarFile ? "2px solid #3b82f6" : "2px dashed #d1d5db", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: "6px" }}
              >
                {avatarPreview ? <img src={avatarPreview} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: "28px" }}>🤖</span>}
              </div>
              <div style={{ fontSize: "11px", color: avatarFile ? "#3b82f6" : "#6b7280" }}>
                {avatarFile ? `✓ ${avatarFile.name}` : "Chatbot Avatar"}
              </div>
              <div style={{ fontSize: "10px", color: "#9ca3af", marginTop: "2px" }}>Click to change</div>
              <input ref={avatarRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarChange} />
            </div>
            {/* Icon size + enter message */}
            <div style={{ flex: 1, minWidth: "200px" }}>
              <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "6px" }}>Chat Icon Size</div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                <input type="range" min={40} max={80} value={chatIconSize} onChange={e => setChatIconSize(Number(e.target.value))} style={{ flex: 1, accentColor: "#3b82f6" }} />
                <span style={{ fontSize: "13px", fontWeight: 600, minWidth: "40px" }}>{chatIconSize}px</span>
              </div>
              <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "6px" }}>Enter message for live chat</div>
              <input value={enterMessage} onChange={e => setEnterMessage(e.target.value)} style={inputStyle} placeholder="Chat Now" />
            </div>
          </div>
        </div>

          {/* Color Theme */}
          <div style={{ background: "#fff", padding: "18px 20px" }}>
            <div style={{ fontWeight: 600, fontSize: "15px", marginBottom: "4px" }}>Color Theme</div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
              {COLOR_THEMES.map(c => (
                <button key={c} onClick={() => setColorTheme(c)} style={{ width: 36, height: 36, borderRadius: "50%", background: c, border: "none", cursor: "pointer", boxShadow: colorTheme === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : "none", transition: "box-shadow 0.15s" }} />
              ))}
            </div>
          </div>

        {/* Attention Grabbers */}
        <div style={{ background: "#fff", padding: "18px 20px" }}>
          <div style={{ fontWeight: 600, fontSize: "15px", marginBottom: "4px" }}>Attention Grabbers</div>
          <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "16px" }}>Draw users attention to your chatbot</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "12px" }} className="bot-links-grid">
            <div>
              <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px" }}>Sound to play when the widget appears</div>
              <select value={attentionSound} onChange={e => setAttentionSound(e.target.value)} style={inputStyle}>
                {["None","Chime","Bell","Pop","Ding"].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px" }}>Animation for chatbot avatar icon</div>
              <select value={attentionAnimation} onChange={e => setAttentionAnimation(e.target.value)} style={inputStyle}>
                {["None","Bounce","Pulse","Shake","Wiggle"].map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px", color: "#374151" }}>
            <input type="checkbox" checked={immediatelyOpenChat} onChange={e => setImmediatelyOpenChat(e.target.checked)} style={{ accentColor: "#3b82f6" }} />
            Immediately Open Chat Window (Desktop Only)
          </label>
        </div>

      </div>{/* end settings accordion */}
        </div>{/* end left column */}

        {/* ── Right: Live Preview ── */}
        <div style={{ width: "320px", flexShrink: 0, position: "sticky", top: "20px" }} className="bot-appearance-preview">
          <div style={{ fontSize: "12px", fontWeight: 600, color: "#9ca3af", letterSpacing: "0.08em", marginBottom: "12px", textTransform: "uppercase" }}>Live Preview</div>
          <ChatPreview
            botTitle={botTitle}
            welcomeMessage={welcomeMessage}
            suggestions={suggestions}
            placeholder={placeholder}
            colorTheme={colorTheme}
            avatarPreview={avatarPreview}
            chatIconSize={chatIconSize}
            showWelcomePopup={showWelcomePopup}
            attentionAnimation={attentionAnimation}
            attentionSound={attentionSound}
          />
        </div>

      </div>{/* end two-column layout */}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "24px" }}>
        <button onClick={() => { setBotTitle(bot.name); setWelcomeMessage("Hi, How can I help you today?"); setColorTheme("#3b82f6"); setSuggestions([]); setPlaceholder("Ask me anything..."); }} style={btnSecondary}>Reset Appearance</button>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <SavedBadge visible={appearSaved} />
          <button onClick={async () => { await save(); appearFlash(); }} disabled={saving || uploadingAvatar} style={{ ...btnPrimary, opacity: saving || uploadingAvatar ? 0.7 : 1 }}>
            {uploadingAvatar ? "Uploading avatar..." : saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .bot-appearance-layout { flex-direction: column !important; }
          .bot-appearance-preview { width: 100% !important; position: static !important; order: -1; }
        }
      `}</style>
    </div>
  );
}

// ─── Deploy Panel ─────────────────────────────────────────────────────────────

function DeployPanel({ bot, onSave, saving, onGoToSettings }: { bot: AiBot; onSave: (u: Partial<AiBot>) => void; saving: boolean; onGoToSettings: () => void }) {
  const [assignedRoles, setAssignedRoles] = useState<string[]>(bot.assignedRoles || []);
  const [copied, setCopied] = useState<string | null>(null);
  const roles = ["manager", "sales", "marketing"];

  // Re-sync when bot prop updates
  const prevIdRef = useRef<string>("");
  useEffect(() => {
    if (prevIdRef.current === bot.id) return;
    prevIdRef.current = bot.id;
    setAssignedRoles(bot.assignedRoles || []);
  }, [bot.id]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const botUrl = `${origin}/bot/${bot.id}`;
  const scriptTag = `<script defer src="${origin}/bot-widget.js" data-bot-id="${bot.id}"></script>`;
  const iframeTag = `<iframe style="width:400px;height:580px;" src="${botUrl}"></iframe>`;

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  function toggleRole(role: string) {
    setAssignedRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  }

  return (
    <div style={{ padding: "32px" }} className="bot-panel-padding">
      <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>Deploy</h2>
      <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "20px" }}>Choose from these 3 simple ways to use your chatbot.</p>

      {/* Not public banner */}
      {!bot.isPublic && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "14px 18px", marginBottom: "20px", fontSize: "13px", color: "#991b1b", display: "flex", alignItems: "center", gap: "8px" }}>
          ⚠️ This bot is not public. Only the owner can access it. Go to <button onClick={onGoToSettings} style={{ background: "none", border: "none", cursor: "pointer", color: "#1d4ed8", textDecoration: "underline", fontSize: "13px", padding: 0 }}>Settings</button> to make it public.
        </div>
      )}

      {/* Assign to Panels */}
      <div style={{ ...card, marginBottom: "20px" }}>
        <div style={{ fontWeight: 600, fontSize: "15px", marginBottom: "4px" }}>Assign to Panels</div>
        <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "14px" }}>Choose which portals can access this bot</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {roles.map(role => (
            <label key={role} style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", padding: "12px", borderRadius: "8px", border: `1px solid ${assignedRoles.includes(role) ? "#1f2937" : "#e5e7eb"}`, background: assignedRoles.includes(role) ? "#f9fafb" : "#fff" }}>
              <input type="checkbox" checked={assignedRoles.includes(role)} onChange={() => toggleRole(role)} style={{ width: "16px", height: "16px", accentColor: "#1f2937" }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: "14px", textTransform: "capitalize" }}>{role} Panel</div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>Show this bot in the {role} portal</div>
              </div>
            </label>
          ))}
        </div>
        <div style={{ marginTop: "14px", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => onSave({ assignedRoles })} disabled={saving} style={btnPrimary}>{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>

      {/* Direct Link */}
      <div style={{ ...card, marginBottom: "20px", display: "flex", gap: "24px", alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Illustration */}
        <div style={{ width: 120, height: 90, background: "#eff6ff", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "36px" }}>💬</div>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <div style={{ fontWeight: 600, fontSize: "15px", marginBottom: "4px" }}>Direct Link</div>
          <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "14px" }}>Share access to your chatbot by using the link below or with the QR code.</div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ flex: 1, padding: "10px 12px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "13px", color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{botUrl}</div>
            <button onClick={() => copy(botUrl, "link")} style={{ ...btnSecondary, padding: "10px 14px", flexShrink: 0 }}>{copied === "link" ? "✓ Copied" : "📋 Copy"}</button>
          </div>
          <button style={{ ...btnPrimary, background: "#3b82f6", display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", padding: "8px 14px" }}>
            ⬇ Download QR
          </button>
        </div>
      </div>

      {/* Add to Website */}
      <div style={{ ...card, marginBottom: "20px", display: "flex", gap: "24px", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ width: 120, height: 90, background: "#f0fdf4", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "36px" }}>🌐</div>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <div style={{ fontWeight: 600, fontSize: "15px", marginBottom: "4px" }}>Add to a Website</div>
          <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "14px" }}>Add the code below to the header of your website to display the chatbot on all pages.</div>
          <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
            <div style={{ flex: 1, padding: "12px", background: "#1f2937", borderRadius: "8px", fontSize: "12px", color: "#a5f3fc", fontFamily: "monospace", wordBreak: "break-all", lineHeight: "1.6" }}>{scriptTag}</div>
            <button onClick={() => copy(scriptTag, "script")} style={{ ...btnSecondary, padding: "10px 14px", flexShrink: 0 }}>{copied === "script" ? "✓" : "📋"}</button>
          </div>
        </div>
      </div>

      {/* Display Inside Webpage */}
      <div style={{ ...card, display: "flex", gap: "24px", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ width: 120, height: 90, background: "#faf5ff", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "36px" }}>🖥️</div>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <div style={{ fontWeight: 600, fontSize: "15px", marginBottom: "4px" }}>Display Inside Webpage</div>
          <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "14px" }}>Display the open chatbot window inside a webpage with an iframe, ready to use.</div>
          <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
            <div style={{ flex: 1, padding: "12px", background: "#1f2937", borderRadius: "8px", fontSize: "12px", color: "#a5f3fc", fontFamily: "monospace", wordBreak: "break-all", lineHeight: "1.6" }}>{iframeTag}</div>
            <button onClick={() => copy(iframeTag, "iframe")} style={{ ...btnSecondary, padding: "10px 14px", flexShrink: 0 }}>{copied === "iframe" ? "✓" : "📋"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Settings Panel ───────────────────────────────────────────────────────────

function SettingsPanel({ bot, onSave, saving, onDelete }: { bot: AiBot; onSave: (u: Partial<AiBot>) => void; saving: boolean; onDelete: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [allUsers, setAllUsers] = useState<{ id: string; name: string; email: string; role: string }[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [editingAccessFor, setEditingAccessFor] = useState<string | null>(null);
  const [draftAccess, setDraftAccess] = useState<string[]>([]);
  const [teamMembers, setTeamMembers] = useState<string[]>(bot.teamMembers || []);
  const [teamMemberAccess, setTeamMemberAccess] = useState<Record<string, string[]>>(bot.teamMemberAccess || {});
  const dropdownRef = useRef<HTMLDivElement>(null);

  const ALL_MODULES = [
    { id: "links",      label: "Links / Docs" },
    { id: "text",       label: "Text" },
    { id: "qa",         label: "Q&A" },
    { id: "live-chat",  label: "Live Chat" },
    { id: "tune",       label: "Tune AI" },
    { id: "test",       label: "Test Your Bot" },
    { id: "appearance", label: "Appearance" },
    { id: "deploy",     label: "Deploy" },
  ];

  const prevSIdRef = useRef<string>("");
  useEffect(() => {
    if (prevSIdRef.current === bot.id) return;
    prevSIdRef.current = bot.id;
    setTeamMembers(bot.teamMembers || []);
    setTeamMemberAccess(bot.teamMemberAccess || {});
  }, [bot.id]);

  // Load users once
  useEffect(() => {
    fetch("/api/users").then(r => r.ok ? r.json() : []).then(data => {
      setAllUsers(data.filter((u: any) => u.role !== "admin"));
    });
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setShowUserDropdown(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filteredUsers = allUsers.filter(u =>
    !teamMembers.includes(u.id) &&
    (u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
     u.email?.toLowerCase().includes(userSearch.toLowerCase()))
  );

  function addTeamMember(user: { id: string; name: string; email: string; role: string }) {
    const updatedMembers = [...teamMembers, user.id];
    const updatedAccess = { ...teamMemberAccess, [user.id]: ALL_MODULES.map(m => m.id) };
    setTeamMembers(updatedMembers);
    setTeamMemberAccess(updatedAccess);
    setUserSearch("");
    setShowUserDropdown(false);
    onSave({ teamMembers: updatedMembers, teamMemberAccess: updatedAccess });
  }

  function removeTeamMember(userId: string) {
    const updatedMembers = teamMembers.filter(id => id !== userId);
    const updatedAccess = { ...teamMemberAccess };
    delete updatedAccess[userId];
    setTeamMembers(updatedMembers);
    setTeamMemberAccess(updatedAccess);
    onSave({ teamMembers: updatedMembers, teamMemberAccess: updatedAccess });
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await fetch(`/api/ai-bots/${bot.id}`, { method: "DELETE" });
      onDelete();
    } catch {
      setDeleting(false);
    }
  }

  const sCard: React.CSSProperties = { ...card, height: "fit-content" };

  return (
    <div style={{ padding: "32px" }} className="bot-panel-padding">
      <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>Settings</h2>
      <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "28px" }}>Use these settings to add security, team members, custom domains and to delete your chatbot.</p>

      {/* Top row: Basic + Security + Email Branding + Custom Domain */}
      {/* Removed all sections as requested */}

      {/* Second row: Password Protection + Timezone + Custom Domain + Delete */}
      {/* Removed all sections as requested */}

      {/* Team Members */}
      <div style={{ ...card, marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          <span style={{ fontSize: "18px" }}>👥</span>
          <div style={{ fontWeight: 700, fontSize: "15px" }}>Team Members</div>
        </div>
        <p style={{ fontSize: "13px", color: "#6b7280", marginBottom: "16px" }}>Add users to manage this bot. Control which modules each member can access.</p>

        {/* User search dropdown */}
        <div style={{ position: "relative", marginBottom: "16px" }} ref={dropdownRef}>
          <input
            value={userSearch}
            onChange={e => { setUserSearch(e.target.value); setShowUserDropdown(true); }}
            onFocus={() => setShowUserDropdown(true)}
            placeholder="Search users by name or email..."
            style={{ ...inputStyle, marginBottom: 0 }}
          />
          {showUserDropdown && filteredUsers.length > 0 && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 100, maxHeight: "220px", overflowY: "auto" }}>
              {filteredUsers.map(u => (
                <div key={u.id} onClick={() => addTeamMember(u)}
                  style={{ padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", borderBottom: "1px solid #f3f4f6" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#fff")}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: u.role === "manager" ? "#ede9fe" : "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, color: u.role === "manager" ? "#6d28d9" : "#1d4ed8", flexShrink: 0 }}>
                    {(u.name || u.email || "?")[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#111827" }}>{u.name || u.email}</div>
                    <div style={{ fontSize: "11px", color: "#6b7280" }}>{u.email} · <span style={{ textTransform: "capitalize" }}>{u.role}</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {teamMembers.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 20px", color: "#9ca3af", background: "#f9fafb", borderRadius: "8px" }}>
            <div style={{ fontSize: "14px", fontWeight: 500, color: "#374151", marginBottom: "4px" }}>No team members added yet</div>
            <div style={{ fontSize: "12px" }}>Search and add users above</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {teamMembers.map(userId => {
              const user = allUsers.find(u => u.id === userId);
              const access = teamMemberAccess[userId] || [];
              const displayName = user ? (user.name || user.email) : userId;
              const displayEmail = user?.email || "";
              const role = user?.role || "";
              const isEditing = editingAccessFor === userId;

              return (
                <div key={userId} style={{ background: "#f9fafb", borderRadius: "10px", border: `1px solid ${isEditing ? "#3b82f6" : "#e5e7eb"}`, overflow: "hidden", transition: "border-color 0.2s" }}>
                  {/* Member header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #e5e7eb", background: "#fff" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: role === "manager" ? "#ede9fe" : "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, color: role === "manager" ? "#6d28d9" : "#1d4ed8", flexShrink: 0 }}>
                        {(displayName)[0]?.toUpperCase() || "?"}
                      </div>
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#111827" }}>{displayName}</div>
                        <div style={{ fontSize: "11px", color: "#6b7280" }}>{displayEmail} · <span style={{ textTransform: "capitalize" }}>{role}</span></div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {!isEditing && (
                        <button
                          onClick={() => { setEditingAccessFor(userId); setDraftAccess([...access]); }}
                          style={{ padding: "5px 12px", borderRadius: "6px", border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                          ✏️ Edit
                        </button>
                      )}
                      <button onClick={() => removeTeamMember(userId)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: "14px" }}>🗑</button>
                    </div>
                  </div>

                  {/* Module access */}
                  <div style={{ padding: "12px 16px" }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "#6b7280", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Module Access</div>

                    {isEditing ? (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "8px", marginBottom: "14px" }}>
                          {ALL_MODULES.map(mod => (
                            <label key={mod.id} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px", color: "#374151" }}>
                              <input
                                type="checkbox"
                                checked={draftAccess.includes(mod.id)}
                                onChange={() => setDraftAccess(prev => prev.includes(mod.id) ? prev.filter(m => m !== mod.id) : [...prev, mod.id])}
                                style={{ accentColor: "#3b82f6", width: 14, height: 14 }}
                              />
                              {mod.label}
                            </label>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            onClick={() => {
                              const updatedAccess = { ...teamMemberAccess, [userId]: draftAccess };
                              setTeamMemberAccess(updatedAccess);
                              onSave({ teamMemberAccess: updatedAccess });
                              setEditingAccessFor(null);
                            }}
                            style={{ padding: "7px 16px", borderRadius: "6px", border: "none", background: "#3b82f6", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                            Save
                          </button>
                          <button
                            onClick={() => setEditingAccessFor(null)}
                            style={{ padding: "7px 16px", borderRadius: "6px", border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {access.length === 0
                          ? <span style={{ fontSize: "12px", color: "#9ca3af" }}>No modules assigned</span>
                          : access.map(modId => {
                              const mod = ALL_MODULES.find(m => m.id === modId);
                              return mod ? (
                                <span key={modId} style={{ padding: "3px 10px", background: "#dbeafe", color: "#1d4ed8", borderRadius: "20px", fontSize: "12px", fontWeight: 500 }}>{mod.label}</span>
                              ) : null;
                            })
                        }
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Chatbot */}
      <div style={{ ...card, border: "1px solid #fecaca" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
          <span style={{ fontSize: "18px" }}>🗑️</span>
          <div style={{ fontWeight: 700, fontSize: "15px", color: "#dc2626" }}>Delete Chatbot</div>
        </div>
        <p style={{ fontSize: "13px", color: "#6b7280", marginBottom: "16px" }}>Deleting a bot is a permanent action that cannot be reversed. Deleting the bot will delete all documents indexed against it and all history.</p>
        <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer", marginBottom: "16px" }}>
          <input type="checkbox" checked={confirmDelete} onChange={e => setConfirmDelete(e.target.checked)} style={{ marginTop: "2px", accentColor: "#dc2626" }} />
          <span style={{ fontSize: "13px", color: "#374151" }}>Yes, I want to delete this bot and all its data permanently.</span>
        </label>
        <button onClick={handleDelete} disabled={!confirmDelete || deleting} style={{ ...btnPrimary, background: confirmDelete ? "#dc2626" : "#e5e7eb", color: confirmDelete ? "#fff" : "#9ca3af", cursor: confirmDelete ? "pointer" : "not-allowed" }}>
          {deleting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </div>
  );
}

// ─── Toggle helper ────────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 44, height: 24, borderRadius: "12px", border: "none", cursor: "pointer", flexShrink: 0,
        background: value ? "#3b82f6" : "#d1d5db", position: "relative", transition: "background 0.2s"
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: value ? 22 : 3, width: 18, height: 18,
        borderRadius: "50%", background: "#fff", transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
      }} />
    </button>
  );
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "#fff", borderRadius: "16px", padding: "32px", width: "440px", maxWidth: "90vw", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: "16px", right: "16px", background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#6b7280" }}>✕</button>
        {children}
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: "#fff", borderRadius: "12px", padding: "20px", border: "1px solid #e5e7eb" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "15px", outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
const btnPrimary: React.CSSProperties = { padding: "10px 20px", background: "#1f2937", color: "#fff", border: "none", borderRadius: "8px", fontSize: "15px", fontWeight: 600, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { padding: "10px 20px", background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "15px", fontWeight: 500, cursor: "pointer" };
const botCard: React.CSSProperties = { background: "#fff", borderRadius: "12px", padding: "20px", border: "1px solid #e5e7eb", cursor: "pointer", transition: "box-shadow 0.2s" };

function useSaved() {
  const [saved, setSaved] = useState(false);
  function flash() { setSaved(true); setTimeout(() => setSaved(false), 2000); }
  return { saved, flash };
}

function SavedBadge({ visible }: { visible: boolean }) {
  return visible ? <span style={{ fontSize: 12, color: "#10b981", fontWeight: 600, marginLeft: 10 }}>✓ Saved!</span> : null;
}

function EditableBotName({ bot, onSave }: { bot: AiBot; onSave: (u: Partial<AiBot>) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(bot.botTitle || bot.name);

  function handleSave() {
    if (draft.trim()) {
      onSave({ botTitle: draft.trim(), name: draft.trim() });
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <div style={{ marginBottom: "12px" }}>
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
          style={{ width: "100%", padding: "4px 8px", fontSize: "14px", fontWeight: 700, border: "1px solid #d1d5db", borderRadius: 6, outline: "none", boxSizing: "border-box", marginBottom: 6 }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={handleSave} style={{ ...btnPrimary, padding: "4px 10px", fontSize: 12, flex: 1 }}>Save</button>
          <button onClick={() => setEditing(false)} style={{ ...btnSecondary, padding: "4px 10px", fontSize: 12, flex: 1 }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: "12px" }}>
      <div style={{ fontWeight: 700, fontSize: "16px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#1f2937", flex: 1 }}>{bot.botTitle || bot.name}</div>
      <button onClick={() => { setDraft(bot.botTitle || bot.name); setEditing(true); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#6b7280" }} title="Edit name">✏️</button>
    </div>
  );
}
