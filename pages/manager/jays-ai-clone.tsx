import type { NextPage } from "next";
import { useState } from "react";
import { ManagerLayout } from "../../src/portals/manager/ManagerLayout";
import { BotChatWidget } from "../../src/components/BotChatWidget";

const JaysAiClonePage: NextPage = () => {
  const [bots, setBots] = useState<any[]>([]);
  const [selectedBot, setSelectedBot] = useState<any>(null);
  const [selectFn, setSelectFn] = useState<((b: any) => void) | null>(null);

  return (
    <ManagerLayout currentView="jays-ai-clone">
      <div className="page-header" style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
        <h1 className="page-title">AI Assistant</h1>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {bots.map(b => (
            <button key={b.id} onClick={() => selectFn?.(b)} style={{
              padding: "6px 14px", borderRadius: "20px", border: "1px solid",
              borderColor: selectedBot?.id === b.id ? "#1f2937" : "#d1d5db",
              background: selectedBot?.id === b.id ? "#1f2937" : "#fff",
              color: selectedBot?.id === b.id ? "#fff" : "#374151",
              fontSize: "13px", fontWeight: 500, cursor: "pointer"
            }}>
              {b.botTitle || b.name}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: "0 24px 24px" }}>
        <BotChatWidget role="manager" onBotsLoaded={(bl, sel, fn) => { setBots(bl); setSelectedBot(sel); setSelectFn(() => (b: any) => { fn(b); setSelectedBot(b); }); }} />
      </div>
    </ManagerLayout>
  );
};

export default JaysAiClonePage;
