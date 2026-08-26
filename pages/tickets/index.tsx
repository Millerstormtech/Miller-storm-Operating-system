import type { NextPage } from "next";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../../src/contexts/AuthContext";
import { Header } from "../../src/components/Header";
import { TicketTable } from "../../src/portals/admin/TicketTable";
import { isTicketOwner } from "../../src/lib/support/categories";

// The "owner" ticket inbox. A ticket-type owner (their account email is listed
// on a support category) handles that type's tickets here — the same TicketTable
// the admin uses, but the API scopes the list, chat, and status changes to only
// the type(s) they own. Admins keep their fuller /admin/tickets page.

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  "c-level": "C-Level",
  "branch-manager": "Branch Manager",
  "sales-team-lead": "Team Lead",
  sales: "Sales",
  marketing: "Marketing",
};

const DASHBOARD_FOR: Record<string, string> = {
  admin: "/admin/leaderboard",
  "c-level": "/c-level/dashboard",
  "branch-manager": "/branch-manager/dashboard",
  "sales-team-lead": "/manager/dashboard",
  sales: "/sales/dashboard",
  marketing: "/marketing/dashboard",
};

const OwnerTicketsPage: NextPage = () => {
  const { user, logout, isLoading } = useAuth();
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
    <div>
      <Header
        title="Miller Storm Operating System"
        subtitle="Support Tickets"
        userName={user.name}
        userId={user.id}
        roleLabel={ROLE_LABEL[user.role] ?? user.role}
        panelName="Support Tickets"
        onLogout={logout}
      />
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px 40px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 4px", color: "var(--text-primary)" }}>Support Tickets</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 14, margin: "0 0 18px" }}>
          Tickets for the categories you handle. Chat with the person who raised each one and update its status.
        </p>
        <TicketTable />
      </div>
    </div>
  );
};

export default OwnerTicketsPage;
