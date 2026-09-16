import { useEffect, useState } from "react";

/** True when the viewer's system asks for less motion (Windows, macOS, iOS and
 *  Android all expose this). Every celebration checks it and simply shows the
 *  same information without moving. Starts false so the server render and the
 *  first client render agree; the real value arrives on the first effect. */
export default function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    // Safari before 14 only has the deprecated listener API.
    if (query.addEventListener) {
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    }
    query.addListener(onChange);
    return () => query.removeListener(onChange);
  }, []);

  return reduced;
}
