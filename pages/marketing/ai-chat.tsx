import type { NextPage } from "next";
import { useState } from "react";
import { MarketingLayout } from "../../src/portals/marketing/MarketingLayout";
import { BotChatWidget } from "../../src/components/BotChatWidget";

const MarketingAiChat: NextPage = () => {
  const [bots, setBots] = useState<any[]>([]);
  const [selectedBot, setSelectedBot] = useState<any>(null);
  const [selectFn, setSelectFn] = useState<((b: any) => void) | null>(null);

  return (
    <MarketingLayout currentView="ai-chat">
      <div className="page-header" style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {bots.map(b => (
            <button key={b.id} onClick={() => selectFn?.(b)} style={{
              padding: "6px 14px", borderRadius: "20px", border: "1px solid",
              borderColor: selectedBot?.id === b.id ? "var(--border-strong)" : "#d1d5db",
              background: selectedBot?.id === b.id ? "var(--surface-inverse-raised)" : "var(--surface-default)",
              color: selectedBot?.id === b.id ? "var(--text-inverse)" : "var(--text-tertiary)",
              fontSize: "13px", fontWeight: 500, cursor: "pointer"
            }}>
              {b.botTitle || b.name}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: "0 24px 24px" }}>
        <BotChatWidget role="marketing" onBotsLoaded={(bl, sel, fn) => { setBots(bl); setSelectedBot(sel); setSelectFn(() => (b: any) => { fn(b); setSelectedBot(b); }); }} />
      </div>
    </MarketingLayout>
  );
};

export default MarketingAiChat;
