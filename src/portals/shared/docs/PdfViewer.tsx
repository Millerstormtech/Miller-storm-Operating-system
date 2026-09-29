import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";
import { loadPdfjs, sharedPdfWorker } from "./pdfjsLoader";

// What a failed response means to the person looking at it.
const STATUS_MESSAGES: Record<number, string> = {
  401: "Your session has expired — log in again to view this document.",
  403: "You don't have access to this document.",
  404: "This document is no longer available.",
  415: "There's no preview for this file type.",
  422: "This document couldn't be converted for preview.",
  503: "Previews for this file type aren't set up on the server yet.",
};

// Widest a page is drawn at 100% zoom, however wide the viewer is.
const MAX_FIT_WIDTH = 900;

type Slot = {
  el: HTMLDivElement;
  canvas: HTMLCanvasElement | null;
  w: number; // page size in PDF points
  h: number;
  renderedScale: number; // canvas resolution it was drawn at, 0 = not drawn
  task: RenderTask | null;
  near: boolean; // within the observer's margin of the visible area
};

// Renders a PDF to <canvas> elements instead of handing it to the browser's
// native PDF plugin (an <iframe src="..."> or <embed>). That native viewer —
// Chrome, Edge, Firefox all do this — carries its OWN download icon in its
// toolbar, which is browser chrome outside this page's DOM and cannot be
// hidden by any CSS/JS here. Painting pixels to a canvas is the only way an
// in-app "view only, no download" claim actually holds for a PDF.
//
// Loads by URL so pdf.js can stream and use range requests (page 1 of a big
// file shows before the rest arrives), and draws pages only as they come near
// the visible area — dropping ones scrolled far away — so a long document is
// neither slow to open nor heavy to keep open. `zoom` is relative to fitting
// the viewer's width; pages are redrawn at the new size, not just stretched.
export function PdfViewer({
  fileUrl,
  title,
  zoom,
  availableWidth,
  loadingText = "Loading document…",
}: {
  fileUrl: string;
  title: string;
  zoom: number;
  availableWidth: number;
  loadingText?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const docRef = useRef<PDFDocumentProxy | null>(null);
  const slotsRef = useRef<Slot[]>([]);
  const firstPageWidthRef = useRef(0);
  const cssScaleRef = useRef(1);
  const zoomRef = useRef(zoom);
  const widthRef = useRef(availableWidth);
  zoomRef.current = zoom;
  widthRef.current = availableWidth;

  // CSS pixels per PDF point: the first page fits the viewer at zoom 1.
  const cssScale = () => {
    const fit = Math.max(Math.min(widthRef.current - 24, MAX_FIT_WIDTH), 200);
    return firstPageWidthRef.current ? (fit * zoomRef.current) / firstPageWidthRef.current : 1;
  };

  const sizeSlots = () => {
    const scale = cssScale();
    cssScaleRef.current = scale;
    for (const s of slotsRef.current) {
      s.el.style.width = `${Math.floor(s.w * scale)}px`;
      s.el.style.height = `${Math.floor(s.h * scale)}px`;
    }
  };

  const dropSlot = (s: Slot) => {
    s.task?.cancel();
    s.task = null;
    s.canvas?.remove();
    s.canvas = null;
    s.renderedScale = 0;
  };

  const renderSlot = async (index: number) => {
    const pdf = docRef.current;
    const s = slotsRef.current[index];
    if (!pdf || !s || !s.near) return;
    // Sharp on high-density screens, capped so a zoomed page stays affordable.
    const target = cssScaleRef.current * Math.min(window.devicePixelRatio || 1, 2);
    if (Math.abs(s.renderedScale - target) < 0.001 || s.task) return;
    try {
      const page = await pdf.getPage(index + 1);
      if (docRef.current !== pdf || !s.near) return;
      const unit = page.getViewport({ scale: 1 });
      if (unit.width !== s.w || unit.height !== s.h) {
        s.w = unit.width;
        s.h = unit.height;
        s.el.style.width = `${Math.floor(s.w * cssScaleRef.current)}px`;
        s.el.style.height = `${Math.floor(s.h * cssScaleRef.current)}px`;
      }
      const viewport = page.getViewport({ scale: target });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.cssText = "display:block;width:100%;height:100%;border-radius:4px;";
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const task = page.render({ canvasContext: ctx, viewport, canvas });
      s.task = task;
      await task.promise;
      if (s.task !== task) return;
      s.task = null;
      // Swap in only once drawn, so a zoom never flashes a blank page.
      s.canvas?.remove();
      s.el.appendChild(canvas);
      s.canvas = canvas;
      s.renderedScale = target;
      // The zoom may have changed while this one was drawing.
      if (Math.abs(cssScaleRef.current * Math.min(window.devicePixelRatio || 1, 2) - target) > 0.001) renderSlot(index);
    } catch (e: any) {
      if (e?.name !== "RenderingCancelledException") console.error("[PdfViewer] page render failed", title, index + 1, e);
      s.task = null;
    }
  };

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let observer: IntersectionObserver | null = null;
    setError(null);
    setReady(false);
    setProgress(null);

    (async () => {
      try {
        const [pdfjs, worker] = await Promise.all([loadPdfjs(), sharedPdfWorker()]);
        if (cancelled) return;
        // Fetch only the byte ranges the pages being shown need. Streaming the
        // whole file alongside (pdf.js's default) splits a slow connection
        // between page 1 and pages nobody has scrolled to yet, so a big scan
        // showed nothing until almost all of it had arrived. Later pages load
        // as they come near the screen. (Files under ~512KB are fetched whole,
        // since pdf.js only switches to ranges above 2× rangeChunkSize.)
        loadingTask = pdfjs.getDocument({
          url: fileUrl,
          worker,
          withCredentials: true,
          rangeChunkSize: 256 * 1024,
          disableStream: true,
          disableAutoFetch: true,
        });
        loadingTask.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
          if (!cancelled && total > 0) setProgress(Math.min(99, Math.round((loaded / total) * 100)));
        };
        const pdf = await loadingTask.promise;
        const first = await pdf.getPage(1);
        if (cancelled) return;
        docRef.current = pdf;
        const unit = first.getViewport({ scale: 1 });
        firstPageWidthRef.current = unit.width;

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = "";
        slotsRef.current = Array.from({ length: pdf.numPages }, () => {
          const el = document.createElement("div");
          el.style.cssText = "position:relative;margin:0 auto 16px;background:white;box-shadow:0 1px 4px rgba(0,0,0,0.15);border-radius:4px;";
          container.appendChild(el);
          return { el, canvas: null, w: unit.width, h: unit.height, renderedScale: 0, task: null, near: false };
        });
        sizeSlots();

        const root = container.closest("[data-viewer-scroll]");
        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const i = slotsRef.current.findIndex((s) => s.el === entry.target);
              const s = slotsRef.current[i];
              if (!s) continue;
              s.near = entry.isIntersecting;
              if (s.near) renderSlot(i);
              else dropSlot(s);
            }
          },
          { root, rootMargin: "1200px 600px" }
        );
        slotsRef.current.forEach((s) => observer!.observe(s.el));
        setReady(true);
      } catch (e: any) {
        if (cancelled) return;
        console.error("[PdfViewer] failed to load", title, e);
        setError(STATUS_MESSAGES[e?.status] ?? "Couldn't load this document. Try again in a moment.");
      }
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      slotsRef.current.forEach(dropSlot);
      slotsRef.current = [];
      docRef.current = null;
      // Destroys this document only; the shared worker stays up for the next one.
      loadingTask?.destroy();
    };
    // renderSlot/sizeSlots read everything they need from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl, title]);

  // Resize every page at once (cheap), then redraw the ones on screen after
  // the zoom settles. Layout effect: sizes must be final before the viewer
  // restores the scroll position around the zoom point.
  useLayoutEffect(() => {
    if (!ready) return;
    sizeSlots();
    const t = setTimeout(() => slotsRef.current.forEach((s, i) => { if (s.near) renderSlot(i); }), 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, availableWidth, ready]);

  return (
    <div
      // Right-click "Save image as…" on a canvas is the one thing worth
      // blocking client-side; everything else about the download UX is
      // already handled server-side (see [id]/file.ts).
      onContextMenu={(e) => e.preventDefault()}
      style={{ padding: "16px 12px", width: "max-content", minWidth: "100%", boxSizing: "border-box", minHeight: 200 }}
    >
      {!ready && !error && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>
          {loadingText}{progress !== null && progress > 0 ? ` ${progress}%` : ""}
        </div>
      )}
      {error && <div style={{ textAlign: "center", padding: 40, color: "var(--trend-down)", fontSize: 13 }}>{error}</div>}
      <div ref={containerRef} />
    </div>
  );
}
