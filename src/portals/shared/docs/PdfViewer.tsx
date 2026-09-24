import { useEffect, useRef, useState } from "react";

// An error whose message is meant for the user, as opposed to a pdf.js failure.
class ViewerError extends Error {}

// Renders a PDF to <canvas> elements instead of handing it to the browser's
// native PDF plugin (an <iframe src="..."> or <embed>). That native viewer —
// Chrome, Edge, Firefox all do this — carries its OWN download icon in its
// toolbar, which is browser chrome outside this page's DOM and cannot be
// hidden by any CSS/JS here. Painting pixels to a canvas is the only way an
// in-app "view only, no download" claim actually holds for a PDF.
export function PdfViewer({ fileUrl, title, loadingText = "Loading document…" }: { fileUrl: string; title: string; loadingText?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let pdfDoc: any = null;

    (async () => {
      try {
        // Loaded on demand (not a top-level import) so the ~1MB pdf.js bundle
        // never ships to a rep who never opens a PDF.
        const pdfjsLib = await import("pdfjs-dist");
        // "?v=2": nginx used to serve .mjs as application/octet-stream, which
        // Chrome refuses to run as a worker, and /_next/static is cached as
        // immutable for a year — a new URL makes browsers holding that bad
        // copy fetch the corrected one.
        pdfjsLib.GlobalWorkerOptions.workerSrc = `${new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString()}?v=2`;

        // Fetched here rather than by pdf.js so a failed response's own error
        // message (e.g. a document that couldn't be converted) reaches the user.
        const res = await fetch(fileUrl, { credentials: "include" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new ViewerError(body.error || "Couldn't load this document. Try again in a moment.");
        }
        const data = new Uint8Array(await res.arrayBuffer());
        if (cancelled) return;
        pdfDoc = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) return;
        setLoading(false);

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = "";

        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
          if (cancelled) return;
          const page = await pdfDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.4 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.cssText = "display:block;width:100%;height:auto;max-width:900px;margin:0 auto 16px;box-shadow:0 1px 4px rgba(0,0,0,0.15);border-radius:4px;";
          container.appendChild(canvas);
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        }
      } catch (e: any) {
        if (!cancelled) {
          console.error("[PdfViewer] failed to render", title, e);
          setError(e instanceof ViewerError ? e.message : "Couldn't load this document. Try again in a moment.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      pdfDoc?.destroy?.();
    };
  }, [fileUrl, title]);

  return (
    <div
      // Right-click "Save image as…" on a canvas is the one thing worth
      // blocking client-side; everything else about the download UX is
      // already handled server-side (see [id]/file.ts).
      onContextMenu={(e) => e.preventDefault()}
      style={{ padding: "16px 12px", minHeight: 200 }}
    >
      {loading && <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>{loadingText}</div>}
      {error && <div style={{ textAlign: "center", padding: 40, color: "#dc2626", fontSize: 13 }}>{error}</div>}
      <div ref={containerRef} />
    </div>
  );
}
