import { useEffect, useState } from "react";
import { useRouter } from "next/router";

// Gates a panel view behind its feature toggle: when the current view's toggle
// is explicitly off for the user, redirect to the panel home and hide the
// children. Returns whether the view is allowed. Shared by the role layouts.
export function useFeatureGate(
  userId: string | undefined,
  currentView: string,
  viewToToggleKey: Record<string, string>,
  redirectPath: string
): boolean {
  const router = useRouter();
  const [allowed, setAllowed] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const toggleKey = viewToToggleKey[currentView];
    if (!toggleKey) return;
    fetch(`/api/users/${userId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.featureToggles?.[toggleKey] === false) {
          setAllowed(false);
          router.replace(redirectPath);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, currentView]);

  return allowed;
}
