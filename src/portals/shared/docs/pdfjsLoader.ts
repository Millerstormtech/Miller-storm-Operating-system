import type { PDFWorker } from "pdfjs-dist";

type Pdfjs = typeof import("pdfjs-dist");

let lib: Promise<Pdfjs> | null = null;
let worker: Promise<PDFWorker> | null = null;

// pdf.js is ~600KB of script (library + worker), so it's loaded on demand and
// only once per visit.
export function loadPdfjs(): Promise<Pdfjs> {
  if (!lib) {
    lib = import("pdfjs-dist").then((pdfjs) => {
      // "?v=2": nginx used to serve .mjs as application/octet-stream, which
      // Chrome refuses to run as a worker, and /_next/static is cached as
      // immutable for a year — a new URL makes browsers holding that bad copy
      // fetch the corrected one.
      pdfjs.GlobalWorkerOptions.workerSrc = `${new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()}?v=2`;
      return pdfjs;
    });
    lib.catch(() => { lib = null; });
  }
  return lib;
}

// One worker for every document the viewer opens. Starting pdf.js's worker
// means compiling ~1.3MB of script, which otherwise happens again per document.
export function sharedPdfWorker(): Promise<PDFWorker> {
  if (!worker) {
    worker = loadPdfjs().then(async (pdfjs) => {
      const w = new pdfjs.PDFWorker();
      await w.promise;
      return w;
    });
    worker.catch(() => { worker = null; });
  }
  return worker;
}

// Called when the Docs & SOPs page opens: fetch and start pdf.js while people
// browse, so the first "View" doesn't have to wait for it.
export function preloadPdfViewer(): void {
  if (typeof window === "undefined") return;
  const start = () => { sharedPdfWorker().catch(() => {}); };
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(start, { timeout: 3000 });
  else setTimeout(start, 1000);
}
