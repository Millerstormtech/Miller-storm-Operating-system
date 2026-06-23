import crypto from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";

// ---------------------------------------------------------------------------
// Lightweight, dependency-free session tokens (HMAC-signed, JWT-like).
//
// A token is `base64url(payload).base64url(hmacSHA256(payloadB64, secret))`.
// We use Node's built-in crypto so no new npm package / server install is
// needed. The token is delivered as an httpOnly cookie so the browser sends
// it automatically on every same-origin request — existing frontend fetch
// calls do not need to change.
// ---------------------------------------------------------------------------

const COOKIE_NAME = "ms_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

// Secret used to sign tokens. AUTH_SECRET MUST be set in the server .env.
// In production a missing secret is a hard error so we never silently sign
// tokens with a publicly-known fallback. In development we warn and use a
// throwaway value so local work isn't blocked.
const SECRET = (() => {
  const fromEnv = process.env.AUTH_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET is not set (or too short). Set a strong AUTH_SECRET in the environment."
    );
  }
  console.warn(
    "[auth] AUTH_SECRET is not set — using an insecure development fallback. Do NOT use in production."
  );
  return "millerstorm-default-insecure-secret-change-me";
})();

export type Session = {
  sub: string; // user id
  role: string; // user role
  exp: number; // expiry (unix seconds)
};

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(payloadB64: string): string {
  return b64url(crypto.createHmac("sha256", SECRET).update(payloadB64).digest());
}

export function signSession(user: { id: string; role: string }): string {
  const payload: Session = {
    sub: user.id,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifySession(token: string): Session | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;

  const expected = sign(payloadB64);
  // timing-safe comparison
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()
    ) as Session;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// Build the Set-Cookie header value for a freshly signed session.
export function buildSessionCookie(token: string): string {
  return [
    `${COOKIE_NAME}=${token}`,
    "HttpOnly",
    "Path=/",
    `Max-Age=${MAX_AGE_SECONDS}`,
    "SameSite=Lax",
    "Secure",
  ].join("; ");
}

// Build the Set-Cookie header that clears the session (for logout).
export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure`;
}

// Attach a freshly signed session cookie to the response.
export function setSession(res: NextApiResponse, user: { id: string; role: string }): void {
  res.setHeader("Set-Cookie", buildSessionCookie(signSession(user)));
}

// Read and verify the session from the request cookies.
export function getSession(req: NextApiRequest): Session | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const match = raw.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  return verifySession(match.slice(COOKIE_NAME.length + 1));
}

// ---------------------------------------------------------------------------
// Bearer-token support.
//
// In addition to the cookie, the same signed token can be supplied via the
// `Authorization: Bearer <token>` header. The Flutter app and (post-migration)
// the web client send it this way. We always check the header first, then fall
// back to the cookie, so both transports keep working.
// ---------------------------------------------------------------------------

export function getBearerToken(req: NextApiRequest): string | null {
  const header = req.headers.authorization || (req.headers as Record<string, string>).Authorization;
  if (!header || typeof header !== "string") return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

// Resolve the verified session for a request from the Bearer header (preferred)
// or the session cookie. Returns null when no valid token is present.
export function getAuthUser(req: NextApiRequest): Session | null {
  const bearer = getBearerToken(req);
  if (bearer) {
    const fromHeader = verifySession(bearer);
    if (fromHeader) return fromHeader;
  }
  return getSession(req);
}

/**
 * Require an authenticated caller. Returns the verified session
 * (`{ sub, role, exp }`) where `sub` is the user id. On a missing or invalid
 * token it sends HTTP 401 and returns null — the caller must `return` early.
 *
 *   const auth = requireUser(req, res); if (!auth) return;
 *   // auth.sub is the trusted user id, auth.role the trusted role
 */
export function requireUser(req: NextApiRequest, res: NextApiResponse): Session | null {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return user;
}

/**
 * Require an authenticated caller whose role is in `roles`. Sends 401 for a
 * missing/invalid token, 403 for a valid token with an unauthorized role.
 * Returns the session or null (caller must `return` early on null).
 */
export function requireRole(
  req: NextApiRequest,
  res: NextApiResponse,
  roles: string | string[]
): Session | null {
  const user = requireUser(req, res);
  if (!user) return null;
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!allowed.includes(user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return user;
}

/**
 * Validate the HTTP method. If the request method is not in `methods`, sends a
 * 405 with the proper `Allow` header and returns false; otherwise returns true.
 *
 *   if (!allowMethods(req, res, ["GET", "POST"])) return;
 */
export function allowMethods(
  req: NextApiRequest,
  res: NextApiResponse,
  methods: string[]
): boolean {
  if (req.method && methods.includes(req.method)) return true;
  res.setHeader("Allow", methods.join(", "));
  res.status(405).json({ error: "Method Not Allowed" });
  return false;
}

type Handler = (req: NextApiRequest, res: NextApiResponse) => void | Promise<void>;

/**
 * Wrap an API handler so it requires a valid login session. Optionally pass
 * `roles` to restrict to specific roles. Anonymous/unauthenticated requests
 * get 401; wrong-role requests get 403. The verified session is attached to
 * `(req as any).session` for the handler to use.
 *
 * OPTIONS (CORS preflight) is already short-circuited by middleware, so it
 * never reaches here.
 */
export function requireAuth(handler: Handler, roles?: string[]): Handler {
  return async (req, res) => {
    const session = getAuthUser(req);
    if (!session) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (roles && roles.length > 0 && !roles.includes(session.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    (req as unknown as { session: Session }).session = session;
    return handler(req, res);
  };
}
