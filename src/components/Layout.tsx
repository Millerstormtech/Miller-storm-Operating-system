import { ReactNode, useState, useEffect } from "react";

type LayoutProps = {
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
  isSidebarCollapsed?: boolean;
};

export function Layout(props: LayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      // Show mobile menu for both mobile and tablet (< 1024px)
      setIsMobile(window.innerWidth < 1024);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isMobileMenuOpen && isMobile) {
        const sidebar = document.querySelector('.app-sidebar');
        const mobileMenuButton = document.querySelector('.mobile-menu-button');
        
        if (sidebar && !sidebar.contains(event.target as Node) && 
            mobileMenuButton && !mobileMenuButton.contains(event.target as Node)) {
          setIsMobileMenuOpen(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMobileMenuOpen, isMobile]);

  return (
    <div
      className={`app-root ${
        props.isSidebarCollapsed ? "sidebar-collapsed" : ""
      } ${isMobileMenuOpen ? "mobile-menu-open" : ""}`}
    >
      {/* Mobile Overlay */}
      {isMobile && isMobileMenuOpen && (
        <div 
          className="mobile-overlay"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside className={`app-sidebar ${isMobile && isMobileMenuOpen ? 'mobile-open' : ''}`}>
        {props.sidebar}
      </aside>
      
      <div className="app-main">
        <header className="app-header" style={{ position: 'relative' }}>
          {/* Mobile Menu Button - positioned relative to header */}
          <button
            className="mobile-menu-button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle navigation menu"
            style={{ display: isMobile ? 'flex' : 'none' }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {isMobileMenuOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                  <line x1="3" y1="18" x2="21" y2="18"></line>
                </>
              )}
            </svg>
          </button>
          {props.header}
        </header>
        <main className="app-content">{props.children}</main>
        <div className="powered-by-footer">Powered by James</div>
      </div>
    </div>
  );
}
