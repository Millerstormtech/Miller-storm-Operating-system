// Single source of truth for the page-title band: an explicit title from the
// page shell wins; otherwise the title is the sidebar label for the active
// view, so the band always matches the menu item that got the user here.
export function resolvePageTitle(
  items: { id: string; label: string }[],
  currentView: string,
  explicit?: string
): string | null {
  // An explicit "" is a deliberate request to hide the title band entirely.
  if (explicit !== undefined) return explicit || null;
  return items.find((i) => i.id === currentView)?.label ?? null;
}
