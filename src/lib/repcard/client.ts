// src/lib/repcard/client.ts
import { REPCARD_BASE, REPCARD_TIMEZONE } from "./config";

// One paced client per RepCard API key. Spaces requests >= 150ms apart; retries 429/5xx.
export function createClient(apiKey: string) {
  if (!apiKey) throw new Error("createClient: missing REPCARD_API_KEY");

  let nextSlotAt = 0;
  const MIN_INTERVAL_MS = 150;
  async function pace() {
    const now = Date.now();
    const wait = Math.max(0, nextSlotAt - now);
    nextSlotAt = Math.max(now, nextSlotAt) + MIN_INTERVAL_MS;
    if (wait) await new Promise((r) => setTimeout(r, wait));
  }

  async function get(path: string, params: Record<string, string | number> = {}): Promise<any> {
    const url = new URL(REPCARD_BASE + path);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    for (let attempt = 0; attempt < 5; attempt++) {
      await pace();
      const res = await fetch(url, {
        headers: { "x-api-key": apiKey, UserTimeZone: REPCARD_TIMEZONE, Accept: "application/json" },
      });
      if (res.status === 404) return null;
      if (res.ok) return res.json();
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250)));
        continue;
      }
      throw new Error(`RepCard ${res.status} on ${path}: ${(await res.text()).slice(0, 200)}`);
    }
    throw new Error(`RepCard retries exhausted on ${path}`);
  }

  // All users. /api/users paginates as result.data (100/page) with result.totalPages.
  async function fetchUsers(): Promise<any[]> {
    const out: any[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const j = await get("/users", { page });
      const res = j?.result ?? {};
      const data = Array.isArray(res) ? res : (res.data ?? []);
      totalPages = res.totalPages ?? 1;
      out.push(...data);
      page++;
    } while (page <= totalPages && page < 100);
    return out;
  }

  // Configured leaderboards for a date range (result[] array).
  async function fetchLeaderboards(fromDate: string, toDate: string): Promise<any[]> {
    const j = await get("/leaderboards", { from_date: fromDate, to_date: toDate });
    return j?.result ?? [];
  }

  return { fetchUsers, fetchLeaderboards };
}

export type RepCardClient = ReturnType<typeof createClient>;
