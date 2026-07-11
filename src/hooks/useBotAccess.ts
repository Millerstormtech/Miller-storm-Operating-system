import { useEffect, useState } from "react";

// Whether the current user is a team member of any AI bot — grants the
// "Master Bot Builder" nav item. Shared by the sales/manager/marketing
// sidebars. (Extracted from 3 identical implementations.)
export function useBotAccess(userId?: string): boolean {
  const [hasBotAccess, setHasBotAccess] = useState(false);

  useEffect(() => {
    if (!userId) return;
    fetch("/api/ai-bots")
      .then(r => r.ok ? r.json() : [])
      .then((bots: any[]) => setHasBotAccess(bots.some((b: any) => b.teamMembers?.includes(userId))))
      .catch(() => {});
  }, [userId]);

  return hasBotAccess;
}
