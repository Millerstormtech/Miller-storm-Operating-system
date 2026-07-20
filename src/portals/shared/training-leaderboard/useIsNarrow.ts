import { useEffect, useState } from "react";

/**
 * True below 768px. Starts false (SSR has no window); corrects on mount.
 */
export function useIsNarrow(): boolean {
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const update = () => setIsNarrow(window.innerWidth < 768);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return isNarrow;
}
