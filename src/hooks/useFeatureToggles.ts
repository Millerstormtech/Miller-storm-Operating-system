import { useEffect, useState } from "react";

export type FeatureToggles = Record<string, boolean>;

// Session cache of a user's feature toggles so a sidebar renders instantly on
// navigation before the network refresh lands.
function getCached(userId: string): FeatureToggles | null {
  try {
    const raw = sessionStorage.getItem(`ft_${userId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function setCache(userId: string, toggles: FeatureToggles) {
  try { sessionStorage.setItem(`ft_${userId}`, JSON.stringify(toggles)); } catch {}
}

// Feature toggles for the current user: seeded from the sessionStorage cache,
// then refreshed from /api/users/:id. Shared by every role's sidebar to hide
// toggled-off nav items. (Extracted from 4 identical sidebar implementations.)
export function useFeatureToggles(userId?: string): FeatureToggles | null {
  const [featureToggles, setFeatureToggles] = useState<FeatureToggles | null>(
    userId ? getCached(userId) : null
  );

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/users/${userId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.featureToggles) {
          setCache(userId, data.featureToggles);
          setFeatureToggles(data.featureToggles);
        }
      })
      .catch(() => {});
  }, [userId]);

  return featureToggles;
}
