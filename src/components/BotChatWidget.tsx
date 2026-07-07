import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";

type AiBot = {
  id: string;
  name: string;
  assignedRoles: string[];
  // Appearance fields
  botTitle: string;
  welcomeMessage: string;
  placeholder: string;
  suggestions: string[];
  removeSuggestionsAfterFirst: boolean;
  colorTheme: string;
  botAvatarUrl: string;
  showWelcomePopup: boolean;
  chatIconSize: number;
  attentionSound: string;
  attentionAnimation: string;
  immediatelyOpenChat: boolean;
  displayMessage: string;
  displayMessageEnabled: boolean;
  privacyPolicyEnabled: boolean;
  privacyActionText: string;
  privacyLinkText: string;
  privacyLink: string;
};
type Attachment = { name: string; url: string; type: string };
type Message = { role: "user" | "assistant"; content: string; attachments?: Attachment[]; timestamp?: string };
type ChatSession = { chatId: string; title: string; messages: Message[]; updatedAt: string };

// Web Audio tones for attention sound
function playSound(sound: string) {
  if (sound === "None" || typeof window === "undefined") return;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const seqs: Record<string, [number, number][]> = {
      Chime: [[523,0.12],[659,0.12],[784,0.2]],
      Bell:  [[880,0.05],[880,0.3]],
      Pop:   [[400,0.04],[600,0.08]],
      Ding:  [[1047,0.25]],
    };
    const seq = seqs[sound] || seqs["Ding"];
    let t = ctx.currentTime;
    seq.forEach(([freq, dur]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq; osc.type = "sine";
      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t); osc.stop(t + dur);
      t += dur + 0.02;
    });
  } catch {}
}

const ANIM_MAP: Record<string, string> = {
  Bounce: "bcw-bounce", Pulse: "bcw-pulse", Shake: "bcw-shake", Wiggle: "bcw-wiggle",
};

// Pick the clearest available English voice. The browser default is often a
// robotic low-quality voice, so we prefer the known natural ones (Google /
// Microsoft Natural / Apple Samantha), then any non-local (network) en-US voice.
function pickBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const en = voices.filter(v => v.lang?.toLowerCase().startsWith("en"));
  const pool = en.length ? en : voices;
  const prefer = [
    /google us english/i,
    /microsoft.*(aria|jenny|natural)/i,
    /samantha/i,
    /google uk english female/i,
    /google/i,
    /natural/i,
  ];
  for (const re of prefer) {
    const found = pool.find(v => re.test(v.name));
    if (found) return found;
  }
  return pool.find(v => v.localService === false)
    || pool.find(v => /en[-_]us/i.test(v.lang))
    || pool[0];
}

export function BotChatWidget({ role, onBotsLoaded }: { role: string; onBotsLoaded?: (bots: AiBot[], selected: AiBot | null, select: (b: AiBot) => void) => void }) {
  const { user } = useAuth();
  const [bots, setBots] = useState<AiBot[]>([]);
  const [selectedBot, setSelectedBot] = useState<AiBot | null>(null);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingBots, setLoadingBots] = useState(true);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  // Voice conversation: listening = mic capturing the user, speaking = the bot's
  // reply is being read aloud. Uses the browser's built-in Web Speech API
  // (SpeechRecognition for STT + speechSynthesis for TTS) — no backend change.
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  // conversing = hands-free mode: the mic stays open (listen → answer → listen)
  // until the user taps the button again to end it.
  const [conversing, setConversing] = useState(false);
  const conversingRef = useRef(false);
  const speakingRef = useRef(false);
  const loadingRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  // Audio recording of the whole voice conversation (your mic + the bot's
  // spoken reply) → downloadable file. recordingUrl holds the finished audio.
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const recordDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const ttsSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const soundPlayedRef = useRef<string>("");
  // Always-current copies so callbacks (esp. voice, which capture stale state)
  // build each turn on the LATEST conversation/chat instead of overwriting it.
  const messagesRef = useRef<Message[]>([]);
  const currentChatIdRef = useRef<string>("");
  // One-shot guard: only auto-resume the most-recent chat on first open, never
  // after a send (that overwrote the active chat with an old one).
  const resumeDoneRef = useRef(false);

  useEffect(() => { loadBots(); }, [role]);
  useEffect(() => { messagesRef.current = messages; bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { currentChatIdRef.current = currentChatId; }, [currentChatId]);
  useEffect(() => {
    if (selectedBot && user?.id) loadChatSessions(true);
  }, [selectedBot?.id, user?.id]);

  // Play attention sound once when bot loads
  useEffect(() => {
    if (!selectedBot) return;
    const sound = selectedBot.attentionSound || "None";
    if (sound !== "None" && soundPlayedRef.current !== selectedBot.id) {
      soundPlayedRef.current = selectedBot.id;
      setTimeout(() => playSound(sound), 600);
    }
  }, [selectedBot?.id]);

  // Close attach menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node))
        setShowAttachMenu(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Load the browser's TTS voices and keep the clearest one selected. Voices
  // often aren't ready on first call, so we also listen for `voiceschanged`.
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const load = () => {
      const v = pickBestVoice(window.speechSynthesis.getVoices());
      if (v) voiceRef.current = v;
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // Keep a ref copy of `loading` so the recognition callbacks (which close over
  // stale state) can check whether a reply is still being fetched.
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // Stop any mic capture / speech / recording when leaving the chat.
  useEffect(() => {
    return () => {
      conversingRef.current = false;
      try { recognitionRef.current?.stop(); } catch { /* ignore */ }
      try { ttsSourceRef.current?.stop(); } catch { /* ignore */ }
      try { recorderRef.current?.state === "recording" && recorderRef.current.stop(); } catch { /* ignore */ }
      try { micStreamRef.current?.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  function newChatId() { return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

  async function loadBots() {
    setLoadingBots(true);
    try {
      const res = await fetch("/api/ai-bots");
      if (res.ok) {
        const all: AiBot[] = await res.json();
        const assigned = all.filter(b => b.assignedRoles?.includes(role));
        setBots(assigned);
        if (assigned.length >= 1) {
          setSelectedBot(assigned[0]);
          setCurrentChatId(newChatId());
          onBotsLoaded?.(assigned, assigned[0], (b) => { setSelectedBot(b); startNewChat(); });
        }
      }
    } finally { setLoadingBots(false); }
  }

  // Refresh the chat list. Pass allowResume=true ONLY on the first open so the
  // most-recent chat is restored. After a send we call it with resume off so it
  // just updates the sidebar and NEVER replaces the active conversation (doing
  // so overwrote the current chat with an old one — messages "disappeared").
  async function loadChatSessions(allowResume = false) {
    if (!user?.id || !selectedBot) return;
    const res = await fetch(`/api/ai-bots/chats?userId=${user.id}&botId=${selectedBot.id}`);
    if (!res.ok) return;
    const sessions: ChatSession[] = await res.json();
    setChatSessions(sessions);
    if (allowResume && !resumeDoneRef.current && messagesRef.current.length === 0 && sessions.length > 0) {
      resumeDoneRef.current = true;
      setMessages(sessions[0].messages || []);
      setCurrentChatId(sessions[0].chatId);
      setSuggestionsDismissed(true);
    }
  }

  function startNewChat() {
    resumeDoneRef.current = true; // an explicit new chat must never be auto-resumed away
    messagesRef.current = [];
    setMessages([]); setAttachments([]);
    setCurrentChatId(newChatId());
    setSuggestionsDismissed(false);
  }

  function loadSession(session: ChatSession) {
    resumeDoneRef.current = true;
    messagesRef.current = session.messages || [];
    currentChatIdRef.current = session.chatId;
    setMessages(session.messages);
    setCurrentChatId(session.chatId);
    setSuggestionsDismissed(true);
  }

  async function deleteSession(chatId: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch("/api/ai-bots/chats", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId })
    });
    setChatSessions(prev => prev.filter(s => s.chatId !== chatId));
    if (currentChatId === chatId) startNewChat();
  }

  async function handleFileAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAttachments(prev => [...prev, { name: file.name, url: reader.result as string, type: file.type }]);
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function send(prefill?: string, speakReply?: boolean) {
    const text = prefill ?? input.trim();
    if ((!text && attachments.length === 0) || loading || !selectedBot || !user) return;
    const userMsg: Message = {
      role: "user", content: text,
      attachments: attachments.length > 0 ? [...attachments] : undefined,
      timestamp: new Date().toISOString()
    };
    // Build on the LATEST conversation (ref), not the closure — in voice mode
    // the callback that calls send() captured an older `messages`, so using the
    // closure here wiped out the turns added since (earlier Q&A "deleted").
    const newMessages = [...messagesRef.current, userMsg];
    messagesRef.current = newMessages;
    setMessages(newMessages); setInput(""); setAttachments([]);
    setLoading(true);
    if (selectedBot.removeSuggestionsAfterFirst) setSuggestionsDismissed(true);
    if (textareaRef.current) textareaRef.current.style.height = "52px";
    try {
      const res = await fetch("/api/ai-bots/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botId: selectedBot.id, messages: newMessages, chatId: currentChatIdRef.current || currentChatId,
          userId: user.id, userName: user.name, userEmail: user.email, userRole: user.role,
          voiceMode: !!speakReply
        })
      });
      const data = await res.json();
      const replyText = data.message || "Sorry, I couldn't respond.";
      // Append the reply to the LATEST conversation (ref) and keep the ref in
      // sync — otherwise the next voice turn rebuilds from a ref that's missing
      // this answer, dropping it from history and wiping it off screen.
      const withReply = [...messagesRef.current, { role: "assistant" as const, content: replyText, timestamp: new Date().toISOString() }];
      messagesRef.current = withReply;
      setMessages(withReply);
      // Voice mode: read the bot's reply aloud so it's a spoken conversation.
      if (speakReply) speakText(replyText);
      loadChatSessions();
    } catch {
      const withError = [...messagesRef.current, { role: "assistant" as const, content: "Failed to get a response. Please try again.", timestamp: new Date().toISOString() }];
      messagesRef.current = withError;
      setMessages(withError);
    } finally { setLoading(false); }
  }

  // ── Voice conversation (OpenAI TTS + mic, recordable) ────────────────────
  function getAudioCtx(): AudioContext {
    if (!audioCtxRef.current) {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
    return audioCtxRef.current!;
  }

  function detachMicFromRecording() {
    if (micNodeRef.current && recordDestRef.current) {
      try { micNodeRef.current.disconnect(recordDestRef.current); } catch { /* not connected */ }
    }
  }
  function attachMicToRecording() {
    if (micNodeRef.current && recordDestRef.current) {
      try { micNodeRef.current.connect(recordDestRef.current); } catch { /* already connected */ }
    }
  }

  // Speak the reply in a natural OpenAI voice, routed through the AudioContext
  // so it's both heard AND captured into the conversation recording. Falls back
  // to the browser voice if TTS fails. When done (in conversation mode) it
  // re-opens the mic for the next question.
  async function speakText(text: string) {
    const clean = (text || "").trim();
    const afterSpeak = () => {
      speakingRef.current = false;
      setSpeaking(false);
      ttsSourceRef.current = null;
      if (conversingRef.current) beginListening();
    };
    if (!clean || typeof window === "undefined") { afterSpeak(); return; }
    speakingRef.current = true;
    setSpeaking(true);
    detachMicFromRecording(); // don't record the bot's voice twice via the mic
    try {
      const res = await fetch("/api/tts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, voice: "nova" })
      });
      if (!res.ok) throw new Error("tts failed");
      const arrayBuf = await res.arrayBuffer();
      const ctx = getAudioCtx();
      if (ctx.state === "suspended") await ctx.resume();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      const src = ctx.createBufferSource();
      src.buffer = audioBuf;
      src.connect(ctx.destination);                                   // hear it
      if (recordDestRef.current) src.connect(recordDestRef.current);  // record it
      src.onended = afterSpeak;
      ttsSourceRef.current = src;
      src.start();
    } catch {
      speakBrowser(clean, afterSpeak); // fallback (not captured in the recording)
    }
  }

  function speakBrowser(text: string, done: () => void) {
    if (typeof window === "undefined" || !window.speechSynthesis) { done(); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (!voiceRef.current) { const v = pickBestVoice(window.speechSynthesis.getVoices()); if (v) voiceRef.current = v; }
    if (voiceRef.current) { u.voice = voiceRef.current; u.lang = voiceRef.current.lang; }
    u.rate = 0.95;
    u.onend = done;
    u.onerror = done;
    window.speechSynthesis.speak(u);
  }

  function stopSpeaking() {
    try { ttsSourceRef.current?.stop(); } catch { /* ignore */ }
    ttsSourceRef.current = null;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    speakingRef.current = false;
    setSpeaking(false);
  }

  // One listening turn. A silent turn just re-listens (in conversation mode) so
  // the mic stays open until the user ends it.
  function beginListening() {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Voice input isn't supported in this browser. Please use Google Chrome."); stopConversation(); return; }
    stopSpeaking(); // never listen to our own voice
    attachMicToRecording(); // record the user's turn
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let gotResult = false;
    rec.onresult = (e: any) => {
      const transcript = e.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) { gotResult = true; setListening(false); send(transcript, true); }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      setListening(false);
      // Silent turn (no speech) → keep listening so the mic stays open. Skip if
      // a reply is being fetched/spoken (those paths re-listen when done).
      if (conversingRef.current && !gotResult && !speakingRef.current && !loadingRef.current) {
        beginListening();
      }
    };
    recognitionRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  }

  // Set up mic capture + a MediaRecorder that records the mixed conversation
  // audio (your mic + the bot's voice). Best-effort — if the mic is blocked the
  // voice chat still works, just without a downloadable recording.
  async function setupRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const ctx = getAudioCtx();
      if (ctx.state === "suspended") await ctx.resume();
      const dest = ctx.createMediaStreamDestination();
      recordDestRef.current = dest;
      micNodeRef.current = ctx.createMediaStreamSource(stream);
      chunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = mime ? new MediaRecorder(dest.stream, { mimeType: mime }) : new MediaRecorder(dest.stream);
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        if (!chunksRef.current.length) return;
        const blob = new Blob(chunksRef.current, { type: chunksRef.current[0].type || "audio/webm" });
        const url = URL.createObjectURL(blob);
        setRecordingUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
      };
      recorderRef.current = rec;
      rec.start();
    } catch (e) {
      console.warn("[voice] recording unavailable:", e);
    }
  }

  function teardownRecording() {
    try { if (recorderRef.current && recorderRef.current.state === "recording") recorderRef.current.stop(); } catch { /* ignore */ }
    try { micStreamRef.current?.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
    recorderRef.current = null;
    micNodeRef.current = null;
    recordDestRef.current = null;
    micStreamRef.current = null;
  }

  async function startConversation() {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Voice input isn't supported in this browser. Please use Google Chrome."); return; }
    if (recordingUrl) { URL.revokeObjectURL(recordingUrl); setRecordingUrl(null); }
    conversingRef.current = true;
    setConversing(true);
    await setupRecording();
    beginListening();
  }

  function stopConversation() {
    conversingRef.current = false;
    setConversing(false);
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    setListening(false);
    stopSpeaking();
    teardownRecording();
  }

  // The mic button toggles the whole hands-free conversation on/off.
  function toggleVoice() {
    if (conversingRef.current) stopConversation();
    else startConversation();
  }

  // Download the recorded audio of the voice conversation (playable in any media player).
  function downloadAudio() {
    if (!recordingUrl) return;
    const a = document.createElement("a");
    a.href = recordingUrl;
    a.download = `voice-conversation-${Date.now()}.webm`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  // Download the current conversation as a plain-text transcript.
  function downloadConversation() {
    if (messages.length === 0) return;
    const botName = selectedBot?.botTitle || selectedBot?.name || "AI";
    const title = chatSessions.find(s => s.chatId === currentChatId)?.title || "Conversation";
    const body = messages
      .filter(m => m.content)
      .map(m => `${m.role === "user" ? "You" : botName}: ${m.content}`)
      .join("\n\n");
    const blob = new Blob([`${title}\n${new Date().toLocaleString()}\n\n${body}\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "conversation"}.txt`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function autoResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target; el.style.height = "52px";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }

  if (loadingBots) return <div style={centerStyle}>Loading...</div>;
  if (bots.length === 0) return (
    <div style={centerStyle}>
      <div style={{ fontSize: "48px", marginBottom: "16px" }}>🤖</div>
      <div style={{ fontSize: "18px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>No bots assigned</div>
      <div style={{ fontSize: "14px", color: "#9ca3af" }}>Ask your admin to assign a bot to this panel</div>
    </div>
  );

  // Appearance values with fallbacks
  const theme      = selectedBot?.colorTheme || "#1f2937";
  const botTitle   = selectedBot?.botTitle || selectedBot?.name || "AI Assistant";
  const avatarUrl  = selectedBot?.botAvatarUrl || "";
  const welcome    = selectedBot?.welcomeMessage || "Hi, How can I help you today?";
  const displayMsg = selectedBot?.displayMessageEnabled ? selectedBot?.displayMessage || "" : "";
  const ph         = selectedBot?.placeholder || "Ask anything";
  const suggestions = (!suggestionsDismissed && messages.length === 0) ? (selectedBot?.suggestions || []) : [];
  const animClass  = ANIM_MAP[selectedBot?.attentionAnimation || ""] || "";
  const iconSize   = selectedBot?.chatIconSize || 60;
  const isNewChat  = messages.length === 0;

  // Sidebar: darkened theme color
  const sidebarBg   = `color-mix(in srgb, ${theme} 55%, #000 45%)`;
  const sidebarDark = `color-mix(in srgb, ${theme} 40%, #000 60%)`;

  function AvatarImg({ size, fontSize }: { size: number; fontSize: string }) {
    return (
      <div style={{ width: size, height: size, borderRadius: "50%", background: theme, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
        {avatarUrl
          ? <img src={avatarUrl} alt="bot" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontSize, color: "#fff" }}>🤖</span>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "calc(100vh - 120px)", background: "#fff", borderRadius: "12px", border: "1px solid #e5e7eb", overflow: "hidden", position: "relative" }}>

      {/* Mobile backdrop */}
      {!sidebarCollapsed && (
        <div className="chat-mobile-backdrop" onClick={() => setSidebarCollapsed(true)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 150 }} />
      )}

      {/* ── Sidebar ── */}
      <div className={`chat-sidebar${sidebarCollapsed ? " chat-sidebar-hidden" : ""}`}
        style={{ width: "260px", minWidth: "260px", background: sidebarBg, display: "flex", flexDirection: "column", overflow: "hidden", transition: "transform 0.25s ease, width 0.2s, min-width 0.2s", flexShrink: 0 }}>

        <div style={{ padding: "16px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <button onClick={startNewChat} style={{ width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px" }}>✏️</span> New Chat
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
          {chatSessions.length === 0
            ? <div style={{ padding: "20px 12px", color: "rgba(255,255,255,0.4)", fontSize: "12px", textAlign: "center" }}>No chats yet</div>
            : chatSessions.map(session => (
              <div key={session.chatId} onClick={() => { loadSession(session); setSidebarCollapsed(true); }}
                style={{ padding: "10px 12px", borderRadius: "8px", cursor: "pointer", marginBottom: "2px", background: currentChatId === session.chatId ? "rgba(255,255,255,0.2)" : "transparent", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", transition: "background 0.15s" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>💬 {session.title}</div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>{new Date(session.updatedAt).toLocaleDateString()}</div>
                </div>
                <button onClick={e => deleteSession(session.chatId, e)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: "14px", padding: "2px 4px", flexShrink: 0 }}>🗑</button>
              </div>
            ))
          }
        </div>

        <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", gap: "10px" }}>
          <AvatarImg size={28} fontSize="13px" />
          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{botTitle}</div>
        </div>
      </div>

      {/* ── Main Chat ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#fff" }}>

        {/* Header — themed */}
        <div style={{ padding: "0 20px", background: theme, display: "flex", alignItems: "center", gap: "12px", flexShrink: 0, minHeight: "56px" }}>
          <button onClick={() => setSidebarCollapsed(p => !p)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "rgba(255,255,255,0.8)", padding: "4px" }}>☰</button>
          <AvatarImg size={34} fontSize="16px" />
          <div style={{ fontWeight: 700, fontSize: "15px", color: "#fff", flex: 1 }}>{botTitle}</div>
          {recordingUrl && (
            <button onClick={downloadAudio} title="Download the voice recording (audio file)"
              style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", cursor: "pointer", fontSize: "13px", fontWeight: 600, padding: "6px 12px", borderRadius: "8px", display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
              🎧 Audio
            </button>
          )}
          {messages.length > 0 && (
            <button onClick={downloadConversation} title="Download the transcript (text)"
              style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", cursor: "pointer", fontSize: "13px", fontWeight: 600, padding: "6px 12px", borderRadius: "8px", display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
              ⬇ Text
            </button>
          )}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 0" }}>
          {isNewChat ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center", padding: "40px" }}>
              <div className={animClass || undefined} style={{ marginBottom: "16px" }}>
                <AvatarImg size={iconSize} fontSize={Math.round(iconSize * 0.4) + "px"} />
              </div>
              <div style={{ fontSize: "22px", fontWeight: 700, color: "#1f2937", marginBottom: "8px" }}>{welcome}</div>
              {displayMsg && <div style={{ fontSize: "14px", color: "#6b7280", marginBottom: "8px" }}>{displayMsg}</div>}
              {suggestions.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center", marginTop: "16px", maxWidth: "500px" }}>
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => send(s)}
                      style={{ padding: "8px 16px", border: `1.5px solid ${theme}`, borderRadius: "20px", fontSize: "13px", color: theme, background: "#fff", cursor: "pointer", fontWeight: 500 }}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ maxWidth: "760px", margin: "0 auto", padding: "0 24px", display: "flex", flexDirection: "column", gap: "24px" }} className="chat-messages-inner">
              {messages.map((m, i) => (
                <div key={i} style={{ display: "flex", gap: "14px", alignItems: "flex-start", flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", background: m.role === "user" ? "#1f2937" : theme, color: "#fff", overflow: "hidden" }}>
                    {m.role === "user" ? "👤" : (avatarUrl ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🤖")}
                  </div>
                  <div style={{ flex: 1, maxWidth: "85%" }}>
                    {m.attachments && m.attachments.length > 0 && (
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "8px", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                        {m.attachments.map((att, ai) => (
                          <div key={ai} style={{ padding: "6px 12px", background: "#f3f4f6", borderRadius: "8px", fontSize: "12px", color: "#374151", display: "flex", alignItems: "center", gap: "6px" }}>📎 {att.name}</div>
                        ))}
                      </div>
                    )}
                    {m.content && (
                      <div style={{ padding: "12px 16px", borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px", background: m.role === "user" ? "#1f2937" : "#f9fafb", color: m.role === "user" ? "#fff" : "#1f2937", fontSize: "14px", lineHeight: "1.6", border: m.role === "assistant" ? "1px solid #e5e7eb" : "none", whiteSpace: "pre-wrap" }}>
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
                      {[0,1,2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#9ca3af", animation: `bounce 1.2s ${i*0.2}s infinite` }} />)}
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
          {attachments.length > 0 && (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
              {attachments.map((att, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 10px", background: "#f3f4f6", borderRadius: "8px", fontSize: "12px" }}>
                  {att.type.startsWith("image/") ? <img src={att.url} alt={att.name} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: "6px" }} /> : <span>📎</span>}
                  <span style={{ maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</span>
                  <button onClick={() => setAttachments(prev => prev.filter((_,idx) => idx !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: "16px", padding: 0, lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ maxWidth: "760px", margin: "0 auto", position: "relative" }} className="chat-input-inner">
            {showAttachMenu && (
              <div ref={attachMenuRef} style={{ position: "absolute", bottom: "calc(100% + 10px)", left: 0, background: sidebarBg, borderRadius: "14px", padding: "8px", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", zIndex: 100, minWidth: "220px", border: "1px solid rgba(255,255,255,0.1)" }}>
                <button onClick={() => { fileRef.current?.click(); setShowAttachMenu(false); }}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", background: "none", border: "none", cursor: "pointer", color: "#fff", fontSize: "14px", borderRadius: "8px", textAlign: "left" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                  <span style={{ fontSize: "20px" }}>🖼️</span> Upload photos & files
                </button>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#f9fafb", borderRadius: "14px", border: "1px solid #e5e7eb", padding: "8px 12px" }}>
              <button onClick={() => setShowAttachMenu(p => !p)} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", cursor: "pointer", background: showAttachMenu ? "#1f2937" : "#e5e7eb", color: showAttachMenu ? "#fff" : "#374151", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", fontWeight: 300, flexShrink: 0, lineHeight: 1, transition: "background 0.15s" }} title="Attach">+</button>
              <input ref={fileRef} type="file" accept="image/*,.pdf,.docx,.doc,.txt,.csv,.xlsx" style={{ display: "none" }} onChange={handleFileAttach} />
              <textarea ref={textareaRef} value={input} onChange={autoResize} onKeyDown={handleKeyDown} placeholder={ph} rows={1}
                style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: "14px", resize: "none", lineHeight: "1.6", fontFamily: "inherit", height: "36px", maxHeight: "200px", overflowY: "auto", padding: "0", color: "#1f2937", alignSelf: "center" }} />
              {/* Talk: hands-free voice conversation. Tap once to start, tap
                  again to end. It keeps listening → answering → listening. */}
              <button onClick={toggleVoice}
                title={conversing ? "End voice conversation" : "Talk — start a voice conversation"}
                className={conversing && !speaking ? "bcw-pulse" : ""}
                style={{ width: 34, height: 34, borderRadius: "50%", border: "none", cursor: "pointer", background: conversing ? (speaking ? "#f59e0b" : "#ef4444") : "#e5e7eb", color: conversing ? "#fff" : "#374151", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0, transition: "background 0.15s" }}>
                {!conversing ? "🎤" : speaking ? "🔊" : "🎙"}
              </button>
              <button onClick={() => send()} disabled={loading || (!input.trim() && attachments.length === 0)}
                style={{ width: 34, height: 34, borderRadius: "50%", border: "none", cursor: loading || (!input.trim() && attachments.length === 0) ? "not-allowed" : "pointer", background: loading || (!input.trim() && attachments.length === 0) ? "#e5e7eb" : theme, color: loading || (!input.trim() && attachments.length === 0) ? "#9ca3af" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0, transition: "background 0.15s" }}>↑</button>
            </div>
            <div style={{ textAlign: "center", fontSize: "11px", color: "#d1d5db", marginTop: "8px" }}>
              <span>Powered by <strong style={{ color: "#9ca3af" }}>MillerStorm</strong></span>
              {selectedBot?.privacyPolicyEnabled && selectedBot?.privacyLink && (
                <span> | {selectedBot.privacyActionText || "Read our"} <a href={selectedBot.privacyLink} target="_blank" rel="noopener noreferrer" style={{ color: "#6b7280", textDecoration: "underline" }}>{selectedBot.privacyLinkText || "Privacy Policy"}</a></span>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }
        @keyframes bcw-bounce { 0%,100%{transform:translateY(0)} 30%{transform:translateY(-14px)} 60%{transform:translateY(-6px)} }
        @keyframes bcw-pulse  { 0%,100%{transform:scale(1)} 50%{transform:scale(1.15)} }
        @keyframes bcw-shake  { 0%,100%{transform:rotate(0)} 15%{transform:rotate(-12deg)} 30%{transform:rotate(12deg)} 45%{transform:rotate(-8deg)} 60%{transform:rotate(8deg)} 75%{transform:rotate(-4deg)} 90%{transform:rotate(4deg)} }
        @keyframes bcw-wiggle { 0%,100%{transform:rotate(0) scale(1)} 25%{transform:rotate(-8deg) scale(1.05)} 75%{transform:rotate(8deg) scale(1.05)} }
        .bcw-bounce { animation: bcw-bounce 1s ease infinite; }
        .bcw-pulse  { animation: bcw-pulse  1.5s ease infinite; }
        .bcw-shake  { animation: bcw-shake  0.8s ease infinite; }
        .bcw-wiggle { animation: bcw-wiggle 0.6s ease infinite; }
        @media (max-width: 768px) {
          .chat-sidebar { position:fixed!important; top:0; left:0; bottom:0; z-index:200; transform:translateX(0); box-shadow:4px 0 24px rgba(0,0,0,0.3); }
          .chat-sidebar-hidden { transform:translateX(-100%)!important; width:260px!important; min-width:260px!important; }
          .chat-messages-inner { padding:0 12px!important; }
          .chat-input-inner { padding:0!important; }
        }
        @media (min-width: 769px) {
          .chat-sidebar { position:relative!important; transform:none!important; }
          .chat-sidebar-hidden { width:0px!important; min-width:0px!important; overflow:hidden!important; }
          .chat-mobile-backdrop { display:none!important; }
        }
      `}</style>
    </div>
  );
}

const centerStyle: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "400px", textAlign: "center", color: "#9ca3af" };
