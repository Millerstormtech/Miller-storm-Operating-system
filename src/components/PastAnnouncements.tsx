import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/router";

// The Past Announcements page, shared by every role's panel (each role has a
// thin route shell under pages/<role>/past-announcements.tsx). The server
// decides what each viewer gets from /api/announcements?history=1: admin and
// c-level see every announcement; everyone else sees company-wide ones plus
// any sent to or by them (rules: src/lib/announcements/history.ts).
type PastAnnouncement = {
  title: string;
  message: string;
  link: string;
  postedByName: string;
  audienceLabel: string;
  createdAt: string;
};

// An announcement's link opens inside the app when it is one of our pages,
// otherwise in a new tab; anything that isn't a web address is not offered.
function announcementLinkKind(link: string): "internal" | "external" | null {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  if (link.startsWith("/") || (origin && link.startsWith(origin))) return "internal";
  if (/^https?:\/\//i.test(link)) return "external";
  return null;
}

export function PastAnnouncements() {
  const router = useRouter();
  const [list, setList] = useState<PastAnnouncement[] | null>(null);
  const [failed, setFailed] = useState(false);

  async function load() {
    setFailed(false);
    try {
      const res = await fetch("/api/announcements?history=1");
      if (!res.ok) throw new Error(String(res.status));
      setList(await res.json());
    } catch (error) {
      console.error("Failed to fetch past announcements:", error);
      setFailed(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openLink(link: string) {
    const kind = announcementLinkKind(link);
    if (kind === "internal") {
      const origin = window.location.origin;
      router.push(link.startsWith("/") ? link : link.slice(origin.length) || "/");
    } else if (kind === "external") {
      window.open(link, "_blank", "noopener,noreferrer");
    }
  }

  const notice = (content: ReactNode) => (
    <div style={{ padding: 32, textAlign: "center", color: "var(--text-subtle)", fontSize: 15 }}>{content}</div>
  );

  return (
    <div style={{ padding: "0 24px 24px", maxWidth: 860 }}>
      {list === null ? (
        notice(
          failed ? (
            <>
              Couldn't load past announcements.{" "}
              <button
                type="button"
                onClick={load}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, fontWeight: 600, color: "var(--brand-fill)", padding: 0 }}
              >
                Try again
              </button>
            </>
          ) : (
            "Loading..."
          )
        )
      ) : list.length === 0 ? (
        notice("No announcements yet")
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {list.map((a, i) => (
            <article
              key={`${a.createdAt}-${i}`}
              style={{
                background: "var(--surface-default)",
                border: "1px solid var(--border-default)",
                borderRadius: 12,
                padding: "20px 24px",
              }}
            >
              <div style={{ fontSize: 13, color: "var(--text-subtle)", marginBottom: 8 }}>
                {[new Date(a.createdAt).toLocaleString(), a.postedByName && `From ${a.postedByName}`, a.audienceLabel].filter(Boolean).join(" · ")}
              </div>
              <h2 style={{ margin: "0 0 10px", fontSize: 18, fontWeight: 700, color: "var(--text-primary)", overflowWrap: "anywhere" }}>
                📢 {a.title}
              </h2>
              <div style={{ fontSize: 15, lineHeight: 1.6, color: "var(--text-muted)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {a.message}
              </div>
              {a.link && announcementLinkKind(a.link) && (
                <button
                  type="button"
                  onClick={() => openLink(a.link)}
                  style={{
                    marginTop: 14,
                    background: "var(--brand-fill)",
                    color: "var(--text-inverse)",
                    border: "none",
                    borderRadius: 6,
                    padding: "8px 16px",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Learn more
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
