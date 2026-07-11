// Compress an uploaded image into a small webp data URL before it is stored.
//
// Course cover images used to be stored as the raw uploaded file encoded to
// base64 (via FileReader.readAsDataURL) with NO resizing. A single full-res 2MB
// PNG cover then shipped to every user inside the /api/courses payload on every
// visit — 5 such covers were 82% of an ~11MB response and the main cause of the
// slow Training Center / Course Builder / Leaderboard pages. This helper caps the
// dimensions and re-encodes to webp so a stored cover stays ~50-80KB.
//
// It is deliberately defensive: any failure (unsupported format, canvas error,
// no webp support) falls back to the original data URL so an upload never breaks.
export async function compressImageToWebp(
  file: File,
  maxWidth = 1460,
  maxHeight = 752,
  quality = 0.8
): Promise<string> {
  const readAsDataUrl = (f: File | Blob) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(f);
    });

  // Non-images, and SVG (which canvas can't reliably rasterize), pass through.
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    return readAsDataUrl(file);
  }

  try {
    const dataUrl = await readAsDataUrl(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });

    const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, width, height);

    const webp = canvas.toDataURL("image/webp", quality);
    // Keep the smaller of the two, and never return a non-webp (unsupported) result.
    if (!webp.startsWith("data:image/webp") || webp.length >= dataUrl.length) {
      return dataUrl;
    }
    return webp;
  } catch {
    // Never block an upload because compression failed.
    return readAsDataUrl(file);
  }
}
