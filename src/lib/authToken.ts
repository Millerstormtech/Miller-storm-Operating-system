// ---------------------------------------------------------------------------
// Client-side auth token storage + a single global `fetch` choke point.
//
// The web app makes ~200 direct `fetch("/api/...")` calls scattered across the
// codebase with no central API client. Rather than edit every call site, we
// patch `window.fetch` ONCE so that every same-origin `/api` request carries
// the `Authorization: Bearer <token>` header automatically. This guarantees
// the header is sent consistently and that existing call sites keep working.
// ---------------------------------------------------------------------------

// The auth token lives in memory only (module-scoped). It is deliberately NOT
// persisted to localStorage/sessionStorage, so a full page reload — a new tab,
// reopening the site, or refresh — starts with no token and forces a fresh
// login. It survives client-side (SPA) navigation because the module stays
// loaded for the lifetime of the tab.
let tokenInMemory: string | null = null;

export function getToken(): string | null {
  return tokenInMemory;
}

export function setToken(token: string): void {
  if (!token) return;
  tokenInMemory = token;
}

export function clearToken(): void {
  tokenInMemory = null;
}

// ---------------------------------------------------------------------------
// "View As" (read-only impersonation). When an admin views another user's
// account, viewOnly is turned on: every mutating internal API request
// (POST/PUT/PATCH/DELETE) is blocked at the fetch choke point, so the admin can
// browse the account but can never change anything. GET/HEAD reads pass through.
// ---------------------------------------------------------------------------
let viewOnly = false;
export function setViewOnly(on: boolean): void {
  viewOnly = on;
}
export function isViewOnly(): boolean {
  return viewOnly;
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  const m = init?.method || (input instanceof Request ? input.method : "GET");
  return (m || "GET").toUpperCase();
}

// Is this request URL one of our own API routes (same-origin /api/...)?
function isInternalApiRequest(input: RequestInfo | URL): boolean {
  try {
    let url: string;
    if (typeof input === "string") url = input;
    else if (input instanceof URL) url = input.toString();
    else url = input.url;

    if (url.startsWith("/api/") || url.startsWith("api/")) return true;
    // Absolute URL to our own origin
    if (typeof window !== "undefined" && url.startsWith(window.location.origin)) {
      return new URL(url).pathname.startsWith("/api/");
    }
    return false;
  } catch {
    return false;
  }
}

let installed = false;

// Install the global fetch wrapper exactly once. Safe to call repeatedly.
export function installAuthFetch(): void {
  if (installed || typeof window === "undefined" || !window.fetch) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Read-only "View As": block every write to our own API. Return a synthetic
    // 403 (callers already handle non-ok responses) and let the UI flash a note.
    if (viewOnly && isInternalApiRequest(input)) {
      const method = methodOf(input, init);
      if (method !== "GET" && method !== "HEAD") {
        try { window.dispatchEvent(new CustomEvent("viewas-blocked")); } catch { /* noop */ }
        return Promise.resolve(
          new Response(JSON.stringify({ error: "View-only mode: changes are disabled while viewing another account." }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
    }
    const token = getToken();
    if (token && isInternalApiRequest(input)) {
      const headers = new Headers(
        init?.headers || (input instanceof Request ? input.headers : undefined)
      );
      if (!headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return originalFetch(input, { ...init, headers });
    }
    return originalFetch(input, init);
  };
}
