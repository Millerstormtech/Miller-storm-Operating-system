// Accounts whose existing logins must stop working right away: deleted,
// suspended, awaiting deletion (the same three /api/login and
// /api/refresh-token refuse), or no longer in the database at all (the bulk
// user sync erases accounts outright).
//
// Why this exists: a session token is valid for 365 days and only
// /api/refresh-token re-checked the account, so a fired or suspended rep whose
// phone stayed logged in could keep using the app, Storm Chat included
// (found 2026-10-15). getAuthUser() in ./auth consults this list, which
// covers every route at once without changing the ~100 call sites.
//
// The list lives in memory per server process. It loads on first use,
// refreshes itself every minute, and is updated immediately when an admin
// changes an account (syncAccount, called from the user routes), so a
// suspension takes effect in seconds. An id the list has never seen (an
// account created since the last load) is let through once while it is
// looked up, then decided like any other. Right after a restart nothing is
// blocked until the first load completes (a second or two).

type AccountRow = { id?: string; deleted?: boolean; suspended?: boolean; deletionRequested?: boolean };
type Loader = () => Promise<AccountRow[]>;
type OneLoader = (appId: string) => Promise<AccountRow | null>;

const REFRESH_MS = 60_000;
const RETRY_AFTER_ERROR_MS = 10_000;

let blocked = new Set<string>();
let active = new Set<string>();
let loaded = false;
let loadedAt = 0;
let loading: Promise<void> | null = null;
const lookingUp = new Set<string>();

export function isBlockedRow(u: AccountRow | null | undefined): boolean {
  return !u || !!u.deleted || !!u.suspended || !!u.deletionRequested;
}

async function loadAllFromDb(): Promise<AccountRow[]> {
  const { connectMongo } = await import("./mongodb");
  await connectMongo();
  const { UserModel } = await import("./models/User");
  return (await UserModel.find({}, { id: 1, deleted: 1, suspended: 1, deletionRequested: 1 }).lean()) as AccountRow[];
}

async function loadOneFromDb(appId: string): Promise<AccountRow | null> {
  const { connectMongo } = await import("./mongodb");
  await connectMongo();
  const { UserModel } = await import("./models/User");
  return (await UserModel.findOne({ id: appId }, { id: 1, deleted: 1, suspended: 1, deletionRequested: 1 }).lean()) as AccountRow | null;
}

let loadAll: Loader = loadAllFromDb;
let loadOne: OneLoader = loadOneFromDb;
// Unit tests never touch a real database unless they install loaders.
const autoLoad = () => !(process.env.NODE_ENV === "test" && loadAll === loadAllFromDb);

/** Start a background reload when the list is older than a minute. */
export function refreshIfStale(now = Date.now(), force = false): Promise<void> | null {
  if (loading || (!force && now - loadedAt < REFRESH_MS) || !autoLoad()) return loading;
  loading = loadAll()
    .then((rows) => {
      const nextBlocked = new Set<string>();
      const nextActive = new Set<string>();
      for (const u of rows) {
        if (!u.id) continue;
        (isBlockedRow(u) ? nextBlocked : nextActive).add(u.id);
      }
      // An account we knew about that is no longer in the database was
      // erased: keep it blocked rather than treating it as never seen.
      for (const id of [...active, ...blocked]) {
        if (!nextActive.has(id) && !nextBlocked.has(id)) nextBlocked.add(id);
      }
      blocked = nextBlocked;
      active = nextActive;
      loaded = true;
      loadedAt = Date.now();
    })
    .catch((e) => {
      // Keep the previous list; try again shortly rather than on every call.
      console.error("[account-status] refresh failed:", e);
      loadedAt = Date.now() - REFRESH_MS + RETRY_AFTER_ERROR_MS;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** Record one account's state now. */
export function setAccountState(appId: string, isBlockedNow: boolean): void {
  if (!appId) return;
  if (isBlockedNow) { blocked.add(appId); active.delete(appId); }
  else { active.add(appId); blocked.delete(appId); }
}

/** Re-read one account and update the list; call after changing a user. */
export async function syncAccount(appId: string): Promise<void> {
  if (!appId || !autoLoadOne()) return;
  try {
    setAccountState(appId, isBlockedRow(await loadOne(appId)));
  } catch (e) {
    console.error("[account-status] sync failed:", e);
  }
}
const autoLoadOne = () => !(process.env.NODE_ENV === "test" && loadOne === loadOneFromDb);

// Reload on a timer (started by the first check) so the list is already
// current when a request arrives, instead of a request waiting on it.
let timer: ReturnType<typeof setInterval> | null = null;
function startTimer() {
  if (timer || !autoLoad()) return;
  timer = setInterval(() => { refreshIfStale(Date.now(), true); }, REFRESH_MS);
  (timer as any).unref?.();
}

/** Is this app user id blocked from using its existing logins? */
export function isAccountBlocked(appId: string): boolean {
  startTimer();
  refreshIfStale();
  if (blocked.has(appId)) return true;
  if (loaded && !active.has(appId) && !lookingUp.has(appId)) {
    // Never seen: maybe created since the last load, maybe erased. Let this
    // one request through and settle it in the background.
    lookingUp.add(appId);
    void syncAccount(appId).finally(() => lookingUp.delete(appId));
  }
  return false;
}

// --- test hooks -------------------------------------------------------------
export function __setAccountLoadersForTests(all: Loader | null, one: OneLoader | null): void {
  loadAll = all || loadAllFromDb;
  loadOne = one || loadOneFromDb;
  blocked = new Set();
  active = new Set();
  loaded = false;
  loadedAt = 0;
  loading = null;
  lookingUp.clear();
}
