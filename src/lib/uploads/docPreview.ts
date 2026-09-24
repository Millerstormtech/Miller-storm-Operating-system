import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { docsDir } from "./docsDir";

// PDF renditions of Office documents for the Docs & SOPs viewer, made with
// LibreOffice on first view and cached next to the originals. The server needs:
//   apt-get install --no-install-recommends libreoffice-writer-nogui \
//     libreoffice-calc-nogui libreoffice-impress-nogui fonts-liberation \
//     fonts-crosextra-carlito fonts-crosextra-caladea
// SOFFICE_PATH lets tests substitute a fake converter.

const CONVERT_TIMEOUT_MS = 120_000;
// Each soffice run takes a few hundred MB; cap how many run at once so a burst
// of first views can't starve the app.
const MAX_CONCURRENT = 2;

let running = 0;
const waiting: Array<() => void> = [];
const inflight = new Map<string, Promise<string>>();

export function previewPathFor(storageKey: string): string {
  return path.join(docsDir(), "previews", `${storageKey}.pdf`);
}

// The cached PDF for a document, converting it first if needed. Concurrent
// requests for the same document share one conversion.
export function pdfPreviewFor(sourcePath: string, storageKey: string): Promise<string> {
  const target = previewPathFor(storageKey);
  if (fs.existsSync(target)) return Promise.resolve(target);
  let job = inflight.get(storageKey);
  if (!job) {
    job = withSlot(() => convert(sourcePath, target)).finally(() => inflight.delete(storageKey));
    inflight.set(storageKey, job);
  }
  return job;
}

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

async function convert(sourcePath: string, target: string): Promise<string> {
  const previewsDir = path.dirname(target);
  await fs.promises.mkdir(previewsDir, { recursive: true });
  // Work inside the previews dir so the final rename stays on one filesystem,
  // with a LibreOffice profile of its own: soffice runs that share a profile
  // block each other.
  const work = await fs.promises.mkdtemp(path.join(previewsDir, ".work-"));
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        process.env.SOFFICE_PATH || "soffice",
        [
          `-env:UserInstallation=${pathToFileURL(path.join(work, "profile")).href}`,
          "--headless", "--norestore", "--nolockcheck",
          "--convert-to", "pdf", "--outdir", work, sourcePath,
        ],
        { timeout: CONVERT_TIMEOUT_MS, killSignal: "SIGKILL" },
        (err) => (err ? reject(err) : resolve()),
      );
    });
    // soffice names the output after the input minus its last extension, and
    // exits 0 even when it couldn't load the file — so check for the PDF.
    const base = path.basename(sourcePath);
    const stem = base.includes(".") ? base.slice(0, base.lastIndexOf(".")) : base;
    const produced = path.join(work, `${stem}.pdf`);
    if (!fs.existsSync(produced)) throw new Error("LibreOffice could not convert this document");
    await fs.promises.rename(produced, target);
    return target;
  } finally {
    await fs.promises.rm(work, { recursive: true, force: true });
  }
}
