# RepCard Verified Door Knocks — Deployment Runbook

Deploy steps for the RepCard union-leaderboard feature (PR #6). Run these **on the VPS**
(`/var/www/millerstorm`) after the PR is merged. Merging alone does nothing — the server
must pull, build, get two new env vars, and restart PM2.

Estimated time: ~10 min + a few minutes for the AccuLynx backfill.

---

## 1. Add the two new environment variables (DO THIS FIRST)

These live only in the developer's local `.env`; the server has its own env and does **not**
have them yet. Without `REPCARD_API_KEY`, the RepCard sync silently does nothing.

Edit `/var/www/millerstorm/.env` and add:

```
# RepCard REST API key (Verified Door Knocks leaderboard)
REPCARD_API_KEY=<paste the RepCard API key>

# Shared secret the RepCard cron uses to trigger the sync (any long random string)
REPCARD_SYNC_SECRET=<paste a long random string>
```

> Get both values from Youssef (they match the local `.env`). Treat them like passwords.

## 2. Pull the merged code and build

```bash
cd /var/www/millerstorm
git pull
npm install          # no new deps in this PR, but safe to run
npm run build
```

Expected: build ends with "Compiled successfully" and the route list.

## 3. Restart PM2 (registers the new repcard-sync process)

```bash
cd /var/www/millerstorm
pm2 start ecosystem.config.js   # picks up the NEW 'repcard-sync' app
pm2 restart millerstorm         # reload the web app on the new build
pm2 save
pm2 status                      # confirm 'repcard-sync' is 'online'
```

## 4. Backfills

### RepCard — AUTOMATIC (no action)
When `repcard-sync` starts it runs immediately, and because there is no sync history yet it
pulls the **whole year to date** on its own. Confirm it ran:

```bash
pm2 logs repcard-sync --lines 30 --nostream
# look for: [repcard-cron] ... -> 200 {"status":"ok","daysProcessed":...,"factsWritten":...}
```

### AccuLynx — RUN ONCE BY HAND
This stamps `repEmail`/`repPhone` onto **existing** deals so they merge with the knocks.
The normal AccuLynx cron only touches recently-changed deals, so run a one-time full backfill.
Use the same host/port/secret the AccuLynx cron already uses successfully (port 6789):

```bash
curl -s -X POST http://localhost:6789/api/acculynx/sync \
  -H "Content-Type: application/json" \
  -H "x-sync-secret: $ACCULYNX_SYNC_SECRET" \
  -d '{"mode":"backfill"}'
```

Expected: JSON with `"status":"ok"` (or `"partial"`) and a per-location breakdown. This can
take a few minutes (hundreds of read calls across the 5 location keys).

> If you skip this, the feature still works — but older reps' knocks and deals show as
> separate rows until each deal is next modified.

## 5. Verify

1. Open the sales leaderboard in the app. Confirm the **Verified Door Knocks** column is
   populated and reps appear (including knock-only reps with 0 deals).
2. Pick a top knocker (e.g. Ashton Foster) and confirm their month-to-date Verified Door
   Knocks matches RepCard's own **D2D Leaderboard** for the same window. If it's off, check
   the server timezone / day boundaries.

## 6. Rollback (if needed)

```bash
cd /var/www/millerstorm
git checkout <previous-commit>
npm run build
pm2 restart millerstorm
pm2 delete repcard-sync    # stop the new cron
```

The new `RepCardKnockFact` collection and the added `repEmail`/`repPhone` fields are additive
and harmless to leave in the database on rollback.

---

## Heads-up for Nadine (not in the PR — mention verbally)
The live AccuLynx leaderboard changes with this deploy: it now shows **all field reps**
(including door-knockers with no deals yet), and the yellow **"unlinked"** badge is gone.
Both are intentional.
