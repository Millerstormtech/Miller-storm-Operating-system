// My Profile: every certificate this person has earned, each downloadable as
// the same PDF they were emailed (2026-09-13). Shared by the rep profile and the
// leaders' profile page; the phone shows the same list from the same endpoint.
import { useEffect, useState } from "react";
import type { CertificateListItem } from "../lib/certificate/credential";
import { certificateDate } from "../lib/certificate/date";

function filenameFrom(disposition: string | null): string | null {
  const m = /filename="([^"]+)"/.exec(disposition || "");
  return m ? m[1] : null;
}

export function MyCertificates() {
  const [items, setItems] = useState<CertificateListItem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/certificates")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (!cancelled) setItems(Array.isArray(data?.certificates) ? data.certificates : []);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetched rather than linked: the session token rides on fetch (authToken.ts),
  // not on a plain navigation.
  async function download(item: CertificateListItem) {
    const id = `${item.kind}:${item.key}`;
    setBusyId(id);
    setFailedId(null);
    try {
      const res = await fetch(item.downloadPath);
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filenameFrom(res.headers.get("Content-Disposition")) || `${item.title}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch {
      setFailedId(id);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mc-card" aria-labelledby="mc-title">
      <h2 id="mc-title" className="mc-title">My Certificates</h2>
      <p className="mc-sub">Download a copy of any certificate you have earned.</p>

      {loadFailed ? (
        <p className="mc-note">Your certificates could not be loaded. Refresh the page to try again.</p>
      ) : items === null ? (
        <p className="mc-note">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mc-note">Certificates you earn show up here.</p>
      ) : (
        <ul className="mc-list">
          {items.map((item) => {
            const id = `${item.kind}:${item.key}`;
            return (
              <li key={id} className="mc-row">
                <div className="mc-text">
                  <span className="mc-name">{item.title}</span>
                  <span className="mc-meta">
                    Issued {certificateDate(new Date(item.issuedAt))}
                    {item.number ? ` · No. ${item.number}` : ""}
                  </span>
                  {failedId === id ? (
                    <span className="mc-error">The download did not work. Try again in a minute.</span>
                  ) : null}
                </div>
                <button type="button" className="mc-download" onClick={() => download(item)} disabled={busyId !== null}>
                  {busyId === id ? "Preparing…" : "Download PDF"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <style jsx>{`
        .mc-card {
          grid-column: 1 / -1;
          background: var(--surface-default);
          border: 1px solid var(--border-default);
          border-radius: 18px;
          padding: 24px;
        }
        .mc-title { margin: 0; font-size: 15px; font-weight: 800; color: var(--text-primary); }
        .mc-sub { margin: 6px 0 14px; font-size: 13px; color: var(--text-muted); }
        .mc-note { margin: 0; font-size: 14px; color: var(--text-muted); }
        .mc-list { list-style: none; margin: 0; padding: 0; }
        .mc-row {
          display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;
          gap: 12px 16px; padding: 14px 0; border-top: 1px solid var(--border-default);
        }
        .mc-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1 1 220px; }
        .mc-name { font-size: 15px; font-weight: 700; color: var(--text-primary); overflow-wrap: anywhere; }
        .mc-meta { font-size: 12.5px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
        .mc-error { font-size: 12.5px; font-weight: 600; color: var(--brand-on-surface); }
        .mc-download {
          flex-shrink: 0; padding: 10px 18px; border-radius: 999px; cursor: pointer;
          background: var(--surface-muted); color: var(--text-primary);
          border: 1px solid var(--border-default); font-size: 14px; font-weight: 700;
          transition: background 0.15s, border-color 0.15s;
        }
        .mc-download:hover:not(:disabled) { background: var(--surface-subtle); border-color: var(--border-strong); }
        .mc-download:focus-visible { outline: 2px solid var(--brand-on-surface); outline-offset: 2px; }
        .mc-download:disabled { opacity: 0.6; cursor: default; }
      `}</style>
    </section>
  );
}
