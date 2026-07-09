# Smoke-Test Profile — Miller Storm (web)

How to smoke-test this repo before committing. Used by the `smoke-test-before-commit` skill.
The universal process lives in the skill; this file holds the **project-specific** facts.

## Stack & commands
- Next.js (Pages Router) — UI **and** API in one app. TypeScript, no test framework.
- Dev server: `npm run dev` → **port 6790**. Production build: `npm run build` (outputs `.next`).
- Run the built app: `npx next start -p 6790` (reuse an existing `npm run build`).
- Backend: MongoDB via Mongoose. DB name is always **`millerstorm`** (forced in `src/lib/mongodb.ts`, regardless of the URI path).

## Data store — there is usually NO local DB
- `.env` `MONGODB_URI` points at `127.0.0.1:27017`, but a local mongod is typically **not running**, and Docker/mongod/mongosh are **not installed** on the dev machine.
- **Production** Mongo is reachable only via an SSH tunnel: `ssh -L 27018:localhost:27017 root@millerstorm.tech -N` in a standalone terminal, then reuse `.env` creds with the port swapped to `27018`.
- ⚠️ **Do NOT point a dev/built server at production to smoke-test.** Mongoose `autoIndex` (default on) will **build any new schema indexes on the live collections** as a startup side-effect, and you put test load on prod. Use the throwaway DB below instead.

### Preferred: throwaway in-memory Mongo (zero prod contact)
1. `npm i mongodb-memory-server --no-save` (downloads a temp mongod binary; nothing permanently installed).
2. A seed script: `MongoMemoryServer.create()` → `getUri()`; connect with the raw `mongodb` driver; `insertMany` plain docs into collections (`users`, `courses`, `userprogresses`, `notifications`, `chatmessages`, `chatgroups`, `groupreadreceipts`); then keep the process alive (`setInterval`) so the DB stays up. Write the URI to a file.
3. Boot the built app against it: `MONGODB_URI="<mem-uri>" AUTH_SECRET="<16+ chars>" npx next start -p 6790`.
4. Probe endpoints with `fetch`/curl using a minted token (below). Tear down: stop both processes; the memory-server cleans up its mongod on exit.

## Auth — mint a token, no password needed
- Auth = **HMAC-signed session tokens** (`src/lib/auth.ts`), sent as `Authorization: Bearer <token>` (or `ms_session` httpOnly cookie). No JWT library.
- Token = `base64url(JSON.stringify({sub, role, exp})) + "." + base64url(HMAC_SHA256(payloadB64, AUTH_SECRET))`.
- Mint one in Node with the same `AUTH_SECRET` you pass to the server:
  ```js
  const crypto = require('crypto');
  const b64 = i => Buffer.from(i).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const sign = p => b64(crypto.createHmac('sha256', SECRET).update(p).digest());
  const mint = (sub, role) => { const p = b64(JSON.stringify({sub, role, exp: Math.floor(Date.now()/1e3)+3600})); return p+'.'+sign(p); };
  ```
- `AUTH_SECRET` must be ≥16 chars. In production a missing secret is a hard error; in dev it warns and uses a fallback.

## Roles / tenancy
- Four roles: **admin, manager, sales, marketing**. Server-side gate is `requireUser` / `requireRole` in `src/lib/auth.ts` (401 unauthenticated, 403 wrong role). Client `ProtectedRoute` is UI-only — always verify the **server** rejects, not just the hidden button.
- "Tenant" scoping that exists: a manager's team via `managerId`; DMs (`chatgroups.isDirect`) readable only by their two members (even admins can't moderate DMs — see the IDOR fix on branch `fix/storm-chat-dm-delete-idor`).

## ID gotchas (bite every time)
- Users have BOTH an app `id` (e.g. `"user-123"`, = `auth.sub`) and a Mongo `_id`. `chatgroups.members/admins` may store either; the messages handler resolves both. Progress/notifications/leaderboard key off the **app `id`**.
- `courses` pages: `?summary=1` **drops `pages` entirely**; `?list=1` **keeps light page metadata** (id/title/status/folderId/isQuiz) but strips `pages.body/transcript/quizQuestions`. No flag = full heavy payload. Pick the flag by what the screen actually reads.
- Chat `mentions` are stored as Mongo `_id` strings but the count endpoints query by `auth.sub` — preserve that quirk when seeding, don't "fix" it in a perf pass.

## Cases worth always checking
- **Notifications** GET returns **unread only** (both consumers filter unread); seed *newer read* rows to confirm they're withheld and the badge count stays exact.
- **Chat counts** (`unread-counts`, `mention-counts`) are per-group; seed a group with a read receipt + a group without one to exercise both branches; assert exact counts.
- **Messages** GET returns the **newest 500** ascending; seed >500 to prove the slice.
- Always assert **both layers**: the HTTP response AND the seeded data it should/shouldn't reflect. Plus an unauthenticated probe (expect 401) and a missing-required-param probe (expect 400).
