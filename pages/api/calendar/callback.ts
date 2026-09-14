// GET /api/calendar/callback — Google redirects the browser here after consent.
// Hit directly by the browser (not fetched by React), so this responds with a
// small static HTML page rather than JSON.
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { verifyShortLived } from "../../../src/lib/auth";
import { exchangeCode } from "../../../src/lib/googleCalendar/client";

function readCookie(req: NextApiRequest, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const match = raw.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#f3f4f6;margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
.card{background:#fff;border-radius:16px;padding:32px;max-width:360px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.1)}
h1{font-size:18px;margin:0 0 8px}p{color:#6b7280;font-size:14px;margin:0}</style></head>
<body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`;
}

const CLEAR_STATE_COOKIE = "gcal_state=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const code = typeof req.query.code === "string" ? req.query.code : null;
  const stateParam = typeof req.query.state === "string" ? req.query.state : null;
  const stateCookie = readCookie(req, "gcal_state");

  res.setHeader("Set-Cookie", CLEAR_STATE_COOKIE);

  // Google returned an error (e.g. the user clicked Cancel) instead of a code.
  if (req.query.error) {
    res.status(200).send(page("Not connected", "Google Calendar wasn't connected. You can close this and try again."));
    return;
  }

  // The state cookie only exists in the browser that started this flow on
  // /connect, and Google echoes back the same value we sent it as `state` —
  // both must match and be a currently-valid signed token, or this callback
  // isn't trustworthy (expired, forged, or a different browser/session).
  const userId =
    code && stateParam && stateCookie && stateParam === stateCookie ? verifyShortLived(stateCookie) : null;
  if (!userId) {
    res.status(400).send(page("Link expired", "This connection link is no longer valid. Please try connecting again from the app."));
    return;
  }

  try {
    const tokens = await exchangeCode(code!);
    await connectMongo();
    // prompt=consent should always return a refresh_token, but if Google ever
    // omits it, keep whatever this user already had rather than losing it.
    const existing = await UserModel.findOne({ id: userId }).select("googleCalendar").lean();
    const refreshToken = tokens.refresh_token || (existing as any)?.googleCalendar?.refreshToken;
    if (!refreshToken) {
      res.status(200).send(page("Couldn't finish connecting", "Google didn't grant offline access. Please try again and make sure to approve the request."));
      return;
    }
    await UserModel.updateOne(
      { id: userId },
      {
        $set: {
          googleCalendar: {
            connected: true,
            accessToken: tokens.access_token,
            refreshToken,
            expiryDate: Date.now() + tokens.expires_in * 1000,
            scope: tokens.scope,
            connectedAt: new Date(),
          },
        },
      }
    );
    res.status(200).send(page("Connected!", "Your Google Calendar is connected. You can close this tab and go back to Miller Storm."));
  } catch (e: any) {
    console.error("[calendar/callback] failed:", e?.message);
    res.status(200).send(page("Couldn't finish connecting", "Something went wrong on our end. Please try again in a moment."));
  }
}
