import { ReactNode } from "react";

export type SidebarItem = {
  id: string;
  label: string;
  icon?: ReactNode;
};

type SidebarProps = {
  items: SidebarItem[];
  activeId: string;
  onSelect: (id: string) => void;
  header: ReactNode;
  onLogout?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  footerContent?: ReactNode;
};

const collapsedIconMap: Record<string, ReactNode> = {
  dashboard: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 13h8V3H3v10zm10 8h8V11h-8v10zM3 21h8v-6H3v6zm10-8h8V3h-8v10z"
      />
    </svg>
  ),
  userManagement: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4 0-7 2-7 4v2h14v-2c0-2-3-4-7-4z"
      />
    </svg>
  ),
  roleHierarchy: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M11 3h2v4h4v2h-4v2h-2V9H7V7h4V3zm-6 8h6v2H5v-2zm8 4h6v2h-6v-2zm-8 4h6v2H5v-2z"
      />
    </svg>
  ),
  businessUnits: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 10h16v10H4V10zm2-6h12v4H6V4z"
      />
    </svg>
  ),
  salesOverview: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 19h16v2H4v-2zm2-4h3v4H6v-4zm5-6h3v10h-3V9zm5-4h3v14h-3V5z"
      />
    </svg>
  ),
  marketingOverview: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 12l14-6v12L4 12zm14 0h2v2h-2v-2z"
      />
    </svg>
  ),
  courseManagement: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 6l9-4 9 4-9 4-9-4zm0 6l9 4 9-4v6l-9 4-9-4v-6z"
      />
    </svg>
  ),
  materialsLibrary: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 4h6v16H4V4zm10 0h6v16h-6V4z"
      />
    </svg>
  ),
  approvalWorkflows: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M9 16l-4-4 1.4-1.4L9 13.2l8.6-8.6L19 6l-10 10z"
      />
    </svg>
  ),
  aiBots: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 6h10v2h2v8h-2v2H7v-2H5V8h2V6zm2 5a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm6 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"
      />
    </svg>
  ),
  webTemplates: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 5h16v4H4V5zm0 6h10v8H4v-8zm12 0h4v8h-4v-8z"
      />
    </svg>
  ),
  team: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm10 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM7 14c-3 0-5 2-5 4v2h8v-2c0-1.1.4-2.1 1.1-3H7zm10 0c-1.6 0-3 .5-4.1 1.4.7.9 1.1 2 1.1 3.1v2h8v-2c0-2-2-4-5-4z"
      />
    </svg>
  ),
  plans: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 2h9l5 5v15H6V2zm8 1.5V8h4.5L14 3.5zM8 12h8v2H8v-2zm0 4h8v2H8v-2z"
      />
    </svg>
  ),
  training: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 3l10 5-10 5L2 8l10-5zm-7 9h14v2H5v-2zm0 4h14v2H5v-2z"
      />
    </svg>
  ),
  onlineTraining: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 5h16v10H4V5zm6 13h4v2h-4v-2z"
      />
    </svg>
  ),
  taskTracker: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M9 11H5v2h4v-2zm10-4H5v2h14V7zm-5 8H5v2h9v-2z"
      />
    </svg>
  ),
  profile: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4 0-7 2-7 4v2h14v-2c0-2-3-4-7-4z"
      />
    </svg>
  ),
  plan: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 4h16v2H4V4zm0 4h10v2H4V8zm0 4h16v2H4v-2zm0 4h10v2H4v-2z"
      />
    </svg>
  ),
  materials: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M5 4h6v16H5V4zm8 2h6v14h-6V6z"
      />
    </svg>
  ),
  aiChat: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 5h16v10H7l-3 3V5zm4 3h8v2H8V8zm0 4h6v2H8v-2z"
      />
    </svg>
  ),
  webPage: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 4h16v4H4V4zm0 6h16v10H4V10zm2 2v6h12v-6H6z"
      />
    </svg>
  ),
  businessCards: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 6h18v12H3V6zm2 2v2h6V8H5zm0 4h10v2H5v-2z"
      />
    </svg>
  ),
  assets: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 5h8v6H4V5zm0 8h8v6H4v-6zm10-8h6v14h-6V5z"
      />
    </svg>
  ),
  approvals: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M9 16l-4-4 1.4-1.4L9 13.2l8.6-8.6L19 6l-10 10z"
      />
    </svg>
  ),
  socialMetrics: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 18l5-6 4 3 7-9 2 1-9 12-4-3-4 5-1-3z"
      />
    </svg>
  )
};

export function Sidebar(props: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-header-row">
          <div className="sidebar-header-title">{props.header}</div>
          {props.onToggleCollapse && (
            <button
              className="sidebar-toggle"
              type="button"
              onClick={props.onToggleCollapse}
              aria-label={props.isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {props.isCollapsed ? "›" : "‹"}
            </button>
          )}
        </div>
      </div>
      <nav className="sidebar-nav">
        {props.items.map((item) => (
          <button
            key={item.id}
            className={
              item.id === props.activeId ? "sidebar-item active" : "sidebar-item"
            }
            onClick={() => props.onSelect(item.id)}
            title={item.label}
          >
            {item.icon && <span className="sidebar-icon">{item.icon}</span>}
            <span className="sidebar-collapsed-icon">
              {collapsedIconMap[item.id] ?? (
                <span className="sidebar-fallback-icon">•</span>
              )}
            </span>
            <span className="sidebar-label">{item.label}</span>
          </button>
        ))}
      </nav>
      {props.footerContent && (
        <div className="sidebar-footer">{props.footerContent}</div>
      )}
      {!props.footerContent && props.onLogout && (
        <div className="sidebar-footer">
          <button className="sidebar-logout-button" onClick={props.onLogout}>
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
