// ---------------------------------------------------------------------------
// Client-side auth token storage + a single global `fetch` choke point.
//
// The web app makes ~200 direct `fetch("/api/...")` calls scattered across the
// codebase with no central API client. Rather than edit every call site, we
// patch `window.fetch` ONCE so that every same-origin `/api` request carries
// the `Authorization: Bearer <token>` header automatically. This guarantees
// the header is sent consistently and that existing call sites keep working.
// ---------------------------------------------------------------------------

const TOKEN_KEY = "token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  if (typeof window === "undefined" || !token) return;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore storage errors */
  }
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore storage errors */
  }
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
