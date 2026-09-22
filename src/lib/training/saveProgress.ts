// A rep's video-watch completion was being saved fire-and-forget
// (`fetch(...).catch(() => {})`): the on-screen state ("Next" unlocked, the
// lesson ticked) updated immediately and unconditionally, while the actual
// server write had no retry and its failure was silently swallowed — so a
// single transient network hiccup at the exact moment a video finished left
// the rep looking, to themselves, like they'd watched it (quiz unlocked and
// passed fine), while the server never recorded the video as complete. That
// is exactly the "quiz has a checkmark, its video doesn't" reports (Preston
// Taylor, Brighton Jenkins — Sept 2026). This retries a few times before
// giving up, and callers surface the failure instead of pretending it worked.
export async function saveProgressWithRetry(
  body: Record<string, unknown>,
  attempts = 3
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return true;
    } catch {
      // network error — fall through to retry
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  return false;
}
