import logoLight from "../../ref. images/MillerStorm-Logo_page-0001.jpg.jpeg";

// Dark-sidebar logo: the transparent PNG (shows the red roof + wordmark on the
// dark background). Light-sidebar logo: the crisp full-colour login-page mark
// (a white-background JPEG that blends into the white sidebar). CSS swaps them
// by theme — see .sidebar-brand-logo in styles.css.
const LOGO_DARK = "/ChatGPT_Image_Feb_23__2026__07_00_52_PM-removebg-preview.png";

export function SidebarBrand() {
  return (
    <div className="sidebar-brand">
      <img className="sidebar-brand-logo sidebar-brand-logo--light" src={logoLight.src} alt="Miller Storm" />
      <img className="sidebar-brand-logo sidebar-brand-logo--dark" src={LOGO_DARK} alt="Miller Storm" aria-hidden="true" />
    </div>
  );
}
