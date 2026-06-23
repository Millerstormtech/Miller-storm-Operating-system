# Authentication Migration Plan

## Goal
Eliminate the vulnerability where API routes trust client-supplied identity
(`req.body.userId`, `req.query.userId`, `userRole`, `managerId`, etc.). Every
protected route must derive the caller's identity from a **server-issued,
server-verified token**.

## Chosen architecture (and why)
The codebase already ships a secure, dependency-free, HMAC-SHA256 signed token
system in `src/lib/auth.ts` (`signSession`/`verifySession`) — this is a
JWT-equivalent and is already wired into `pages/api/login.ts` via an httpOnly
cookie. We **build on it** rather than introduce a parallel `jsonwebtoken`
implementation.

We move to a **hybrid token model**:
- `login` returns the signed token in the JSON body (`{ token, user }`) **and**
  keeps setting the httpOnly cookie.
- Auth helpers accept the token from **`Authorization: Bearer <token>` first,
  then fall back to the cookie**.

This satisfies every requirement at once:
- Flutter (no cookie jar) → stores token, sends `Authorization` header.
- Web → stores token in `localStorage`, sends `Authorization` header; the cookie
  remains as defense-in-depth.
- Existing flows keep working during rollout (cookie still valid).

The signing secret comes from `process.env.AUTH_SECRET` (already supported);
we add it to `.env` and harden the insecure fallback.

## New auth helpers (`src/lib/auth.ts`)
- `getBearerToken(req)` — parse `Authorization: Bearer <token>`.
- `getAuthUser(req)` — verify Bearer token, else cookie; return `{ sub, role }` or null.
- `requireUser(req, res)` — return authenticated `{ sub, role }`; send **401** and return null if missing/invalid.
- `requireRole(req, res, roles)` — `requireUser` + role check; send **403** and return null if role not allowed.
- `allowMethods(req, res, [...])` — send **405** + `Allow` header for unsupported methods.
- Existing `requireAuth(handler, roles)` HOF retained for already-wrapped routes.

### Per-route migration pattern
```ts
if (!allowMethods(req, res, ["GET", "POST"])) return;          // 405
const auth = requireUser(req, res); if (!auth) return;          // 401
// const auth = requireRole(req, res, ["admin"]); if (!auth) return;  // 401/403
// identity now comes from auth.sub / auth.role — NOT req.body/req.query
const progress = await UserProgressModel.findOne({ userId: auth.sub, courseId });
```

## Route classification (80 routes under `pages/api/`)

### Public (no token required)
- `login.ts`, `forgot-password.ts`, `reset-password.ts`
- `public-profile/[username].ts`
- `acculynx/webhook.ts` (authenticated by webhook secret, not user token)

### Authenticated (any valid token; identity from `auth.sub`)
progress.ts, progress/save.ts, course-progress.ts, web-progress.ts,
notifications.ts, leaderboard.ts, business-plan(s).ts, chat.ts, sales-chat.ts,
chat-history.ts, lesson-chat-history.ts, generate-chat-title.ts,
ai-bots/{chat,chats,history,index GET}, course-ai-bots/*,
storm-chat/{messages,mark-read,mention-counts,unread-counts,groups GET},
tasks/index.ts, social-media-metrics (read), marketing-materials (read),
apps-tools (read), playlists, playlist-assignments, user-requests,
training-timer(.ts/-sms.ts), upload-image.ts, analyze-video.ts, web-text.ts,
bot-stats, users/{[id] self,by-mongo-id,by-mongo-ids,check-email}, courses (read)

### Manager/Admin
manager-actuals.ts, business-plan GET (team view), playlist-assignments (assign),
playlists (write), storm-chat group management, manager team data endpoints

### Admin only
admin/* (all), users/index POST, users/bulk, users/import,
courses write (POST/PUT/DELETE) + courses/bulk, apps-tools write + categories,
marketing-materials write + sync, ai-bots write/upload/crawl/admin-chats,
course-ai-bots write, sms-templates, social-media-metrics/columns write,
admin/email-config

> Exact method-level role rules are applied per route during migration (e.g. a
> route may be GET=authenticated, POST/DELETE=admin).

## Client changes
### Web (`src/`)
- `src/lib/authToken.ts` (new): token get/set/clear + a one-time global `fetch`
  wrapper that injects `Authorization: Bearer <token>` on same-origin `/api`
  requests. **Single choke point** — the ~223 existing `fetch()` calls are not
  individually edited.
- `AuthContext.tsx`: store token on login, clear on logout, install the wrapper.

### Flutter (`Jamesapk/`)
- `lib/services/auth_service.dart`: store token from login response.
- `lib/services/api_client.dart` (new): `http.BaseClient` subclass that injects
  the `Authorization` header on every request; screens migrate from `http.get`
  to the shared client.

## Rollout batches
1. **Foundation** — auth helpers, login returns token, `.env` secret, web token wrapper, Flutter client. (Additive, backward-compatible.)
2. **Self-data routes** — progress/course-progress/web-progress/notifications/business-plan/chat-history/lesson-chat-history.
3. **Storm-chat + AI bots** routes.
4. **Courses / playlists / training / social-metrics / marketing / apps-tools.**
5. **Admin + user-management routes** (strict role checks).
6. **Verification** — typecheck, grep for residual client-supplied identity, smoke test.

## Deliverables (COMPLETED)

### Authentication architecture summary
- **Token**: HMAC-SHA256 signed token (`base64url(payload).base64url(sig)`), payload `{ sub, role, exp }`, 7-day expiry, signed with `AUTH_SECRET`. Production now **hard-fails** if `AUTH_SECRET` is unset/short; dev warns and uses a fallback.
- **Transport (hybrid)**: `login` returns the token in the JSON body **and** sets the existing httpOnly cookie. Server helpers read the token from `Authorization: Bearer <token>` first, then fall back to the cookie.
- **Helpers** (`src/lib/auth.ts`): `requireUser(req,res)` → `{sub,role}` or 401; `requireRole(req,res,roles)` → 401/403; `allowMethods(req,res,[...])` → 405; plus `getBearerToken`, `getAuthUser`. Existing `requireAuth` HOF now also accepts Bearer.
- **Identity**: every protected route derives the caller from `auth.sub`/`auth.role`. Client-supplied `userId`/`userRole`/`adminUserId`/`senderId`/`reviewedBy` are no longer trusted for identity.

### Files changed (116 total)
- **Auth core**: `src/lib/auth.ts`, `pages/api/login.ts`, `.env` (added `AUTH_SECRET`).
- **Web client**: `src/lib/authToken.ts` (new — token store + global fetch wrapper), `src/contexts/AuthContext.tsx`, `src/App.tsx`.
- **Flutter client**: `Jamesapk/lib/services/api_client.dart` (new — `AuthClient`), `auth_service.dart`, + 28 screen/service files (`http.*` → authenticated `api.*`, multipart `request.send()` → `api.send(request)`).
- **API routes**: 79 of 80 route files (all except `login.ts` already issuing tokens).

### Routes migrated (by class)
- **Public (method-guarded, no token)**: `login`, `forgot-password`, `reset-password`, `public-profile/[username]`, `acculynx/webhook` (webhook-secret auth), `users/check-email`, plus `user-requests` POST (registration entry point; its GET/DELETE are admin-gated).
- **Authenticated (any valid token, identity = `auth.sub`)**: progress, progress/save, course-progress, web-progress, notifications, chat-history, lesson-chat-history, generate-chat-title, chat, sales-chat, leaderboard, ai-bots/{chat,chats,history*,index GET,[id] GET}, course-ai-bots/{chat,chats,index GET,[id] GET}, storm-chat/{messages,mark-read,mention-counts,unread-counts,groups GET}, courses GET, apps-tools GET, marketing-materials GET, social-media-metrics GET, playlists GET, playlist-assignments GET, training-timer(.ts/-sms), upload-image, analyze-video, users/{by-mongo-id,by-mongo-ids}, web-text GET (public for rep pages).
- **Manager/Admin**: playlists/playlist-assignments writes, storm-chat group management, manager-actuals, business-plans, users index GET, business-plan GET (ownership-aware).
- **Admin only**: all `admin/*`, users index POST + bulk + import, courses writes + bulk, apps-tools writes + categories, marketing-materials writes + sync, ai-bots writes/upload/crawl/admin-chats + bot-stats, course-ai-bots writes, sms-templates, social-media-metrics writes + columns, user-requests/[id], playlist-assignments/check-deadlines.
- **Ownership-checked**: `users/[id]` (GET self|admin|manager; PUT/PATCH self|admin; DELETE admin), `business-plan` (non-privileged users forced to `auth.sub`).

### Remaining routes
None unprotected. All 80 routes validate methods (405) and either require a verified token or are intentionally public (login, password reset/forgot, public profile, webhook, check-email, registration POST).

### Breaking changes
1. **`AUTH_SECRET` must be set in every server environment** (added to local `.env`; set it in Vercel/VPS). Missing in production = startup error by design.
2. **Already-logged-in sessions with no token are forced to re-login** — old web/Flutter sessions stored a user object but no token; their requests now get 401 until the user logs in again (expected for a security cutover).
3. **`playlist-assignments/check-deadlines`** now requires an admin token — any cron/scheduler hitting it must send an admin Bearer token (or be moved behind a dedicated internal secret).
4. Unsupported HTTP methods now return **405** where some routes previously fell through.

### Security improvements achieved
- Eliminated client-supplied identity trust — impersonation via `userId`/`adminUserId`/`userRole` is closed.
- Role-based authorization enforced from verified token (admin/manager/sales) → 403 on violation.
- Consistent 401 (missing/invalid token), 403 (wrong role), 405 (bad method) across all routes.
- Stronger secret handling (no silent insecure fallback in production).
- Defense-in-depth: token accepted via Bearer header and httpOnly cookie.
- Web identity-header injection centralized at one choke point (global `fetch` wrapper); Flutter via a single `AuthClient`.

### Verification
- `npx tsc --noEmit` — clean (exit 0).
- `flutter analyze lib` — no errors (pre-existing `avoid_print` infos only).
- Audit: 0 routes read client-supplied `userId`/`adminUserId`/`senderId`/`reviewedBy` as identity; every route references the auth layer.
