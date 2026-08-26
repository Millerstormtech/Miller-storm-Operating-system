import type { NextPage } from "next";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../../src/contexts/AuthContext";
import { TicketTable } from "../../src/portals/admin/TicketTable";
import { isTicketOwner } from "../../src/lib/support/categories";
import { CLevelLayout } from "../../src/portals/c-level/CLevelLayout";
import { SalesLayout } from "../../src/portals/sales/SalesLayout";
import { SalesTeamLeadLayout } from "../../src/portals/manager/SalesTeamLeadLayout";
import { BranchManagerLayout } from "../../src/portals/branch-manager/BranchManagerLayout";
import { MarketingLayout } from "../../src/portals/marketing/MarketingLayout";

// The "owner" ticket inbox. A ticket-type owner (their account email is listed
// on a support category) handles that type's tickets here — the same TicketTable
// the admin uses, but the API scopes the list, chat, and status changes to only
// the type(s) they own. Admins keep their fuller /admin/tickets page.
//
// The inbox is wrapped in the viewer's OWN role layout so it keeps that panel's
// sidebar + header chrome instead of rendering as a bare page.

const DASHBOARD_FOR: Record<string, string> = {
  admin: "/admin/leaderboard",
  "c-level": "/c-level/dashboard",
  "branch-manager": "/branch-manager/dashboard",
  "sales-team-lead": "/manager/dashboard",
  sales: "/sales/dashboard",
  marketing: "/marketing/dashboard",
};

const TITLE = "Support Tickets";
const SUBTITLE = "Tickets for the categories you handle. Chat with the person who raised each one and update its status.";

// Render the inbox inside whichever portal layout matches the viewer's role, so
// the sidebar and top bar are the same as the rest of their panel.
function RoleShell({ role, children }: { role: string; children: React.ReactNode }) {
  switch (role) {
    case "c-level":
      return <CLevelLayout currentView="dashboard" pageTitle={TITLE} pageSubtitle={SUBTITLE}>{children}</CLevelLayout>;
    case "branch-manager":
      return <BranchManagerLayout currentView="dashboard" pageTitle={TITLE} pageSubtitle={SUBTITLE}>{children}</BranchManagerLayout>;
    case "sales-team-lead":
      return <SalesTeamLeadLayout currentView="dashboard" pageTitle={TITLE} pageSubtitle={SUBTITLE}>{children}</SalesTeamLeadLayout>;
    case "sales":
      return <SalesLayout currentView="dashboard" pageTitle={TITLE} pageSubtitle={SUBTITLE}>{children}</SalesLayout>;
    case "marketing":
      return <MarketingLayout currentView="dashboard" pageTitle={TITLE} pageSubtitle={SUBTITLE}>{children}</MarketingLayout>;
    default:
      return <>{children}</>;
  }
}

const OwnerTicketsPage: NextPage = () => {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const isOwner = isTicketOwner(user?.email);

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace("/login"); return; }
    // Admins have their own richer inbox.
    if (user.role === "admin") { router.replace("/admin/tickets"); return; }
    // Not a handler for any type → back to their own dashboard.
    if (!isOwner) { router.replace(DASHBOARD_FOR[user.role] ?? "/login"); return; }
  }, [user, isLoading, isOwner, router]);

  // While unresolved or redirecting, render nothing.
  if (isLoading || !user || user.role === "admin" || !isOwner) return null;

  return (
    <RoleShell role={user.role}>
      <TicketTable />
    </RoleShell>
  );
};

export default OwnerTicketsPage;
