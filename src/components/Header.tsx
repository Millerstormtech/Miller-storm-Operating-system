import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/router";
import { NotificationBell } from "./NotificationBell";
import { TicketButton } from "./TicketButton";
import { AnnouncementButton } from "./AnnouncementButton";

type HeaderProps = {
  title: string;
  subtitle?: string;
  userName: string;
  roleLabel: string;
  userId?: string;
  onLogout: () => void;
  showProfileDropdown?: boolean;
  panelName?: string; // Add panel name prop
};

export function Header(props: HeaderProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // App-wide light/dark theme. Stored in localStorage and applied as
  // data-theme on <html>; pages that are theme-aware (e.g. the Sales
  // Leaderboard) restyle themselves from that attribute via CSS.
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const saved = (typeof window !== "undefined" && localStorage.getItem("ms-theme")) as
      | "light"
      | "dark"
      | null;
    const initial = saved === "dark" ? "dark" : "light";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);
  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    try { localStorage.setItem("ms-theme", next); } catch { /* ignore */ }
    document.documentElement.setAttribute("data-theme", next);
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="header">
      <div className="header-titles">
        {/* Show panel name on mobile/tablet next to hamburger menu */}
        {props.panelName && (
          <div className="header-panel-name">
            {props.panelName}
          </div>
        )}
        <h1 className="header-title">{props.title} {props.panelName && <span style={{ fontSize: '1em', marginLeft: 2 }}><span style={{ color: 'inherit' }}>| </span><span style={{ color: '#e01418' }}>{props.panelName}</span></span>}</h1>
        {props.subtitle && (
          <p className="header-subtitle">{props.subtitle}</p>
        )}
      </div>
      <div className="header-profile">
        <AnnouncementButton />
        <TicketButton />
        {props.userId && <NotificationBell userId={props.userId} />}
        <div className="header-user-info" style={{ position: "relative" }} ref={dropdownRef}>
          <span 
            className="header-user-name" 
            onClick={() => props.showProfileDropdown && setShowDropdown(!showDropdown)}
            style={props.showProfileDropdown ? { cursor: "pointer" } : {}}
          >
            {props.userName}
          </span>
          <span 
            className="header-user-role"
            onClick={() => props.showProfileDropdown && setShowDropdown(!showDropdown)}
            style={props.showProfileDropdown ? { cursor: "pointer" } : {}}
          >
            {props.roleLabel}
          </span>
          {props.showProfileDropdown && showDropdown && (
            <div style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: "8px",
              backgroundColor: "var(--surface-default)",
              border: "1px solid var(--border-default)",
              borderRadius: "10px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
              minWidth: "150px",
              zIndex: 1000,
              overflow: "hidden"
            }}>
              <div
                onClick={() => {
                  setShowDropdown(false);
                  router.push("/sales/profile");
                }}
                style={{
                  padding: "10px 16px",
                  cursor: "pointer",
                  color: "var(--text-primary)",
                  transition: "background-color 0.2s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--surface-muted)"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
              >
                My Profile
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          className="header-theme-toggle"
          onClick={toggleTheme}
          title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          aria-label="Toggle dark mode"
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            border: "1px solid var(--border-default)",
            background: "transparent",
            color: "var(--text-primary)",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {theme === "light" ? "🌙" : "☀️"}
        </button>
        <button className="header-logout" onClick={props.onLogout}>
          Logout
        </button>
      </div>
    </div>
  );
}
