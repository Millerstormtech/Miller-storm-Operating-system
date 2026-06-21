import { useState } from "react";
import { Layout } from "../components/Layout";
import { Sidebar } from "../components/Sidebar";
import { Header } from "../components/Header";
import { DashboardCard } from "../components/DashboardCard";
import { AuthenticatedUser } from "../types";

type MarketingPortalProps = {
  currentUser: AuthenticatedUser;
  onLogout: () => void;
};

type MarketingViewId =
  | "dashboard"
  | "training"
  | "assets"
  | "approvals"
  | "socialMetrics";

const sidebarItems: { id: MarketingViewId; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "training", label: "Training Center" },
  { id: "assets", label: "Asset Library" },
  { id: "approvals", label: "Content Approvals" },
  { id: "socialMetrics", label: "Social Metrics Dashboard" }
];

function MarketingDashboard() {
  return (
    <div className="grid grid-4">
      <DashboardCard
        title="Active Campaigns"
        value="12"
        description="Across all regions"
      />
      <DashboardCard
        title="Social Engagement"
        value="+22%"
        description="Versus last month"
      />
      <DashboardCard
        title="Asset Downloads"
        value="3,420"
        description="Last 30 days"
      />
      <DashboardCard
        title="Rep Web Pages Live"
        value="86"
        description="Published and active"
      />
    </div>
  );
}

function Placeholder(props: { title: string; description: string }) {
  return (
    <div className="placeholder">
      <div className="placeholder-title">{props.title}</div>
      <div className="placeholder-description">{props.description}</div>
    </div>
  );
}

export function MarketingPortal(props: MarketingPortalProps) {
  const [activeView, setActiveView] = useState<MarketingViewId>("dashboard");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  function renderView() {
    if (activeView === "dashboard") {
      return <MarketingDashboard />;
    }
    if (activeView === "training") {
      return (
        <Placeholder
          title="Marketing Training Center"
          description="Courses and resources for marketing team members."
        />
      );
    }
    if (activeView === "assets") {
      return (
        <Placeholder
          title="Asset Library"
          description="Manage campaign assets, evergreen content, and field resources."
        />
      );
    }
    if (activeView === "approvals") {
      return (
        <Placeholder
          title="Content Approvals"
          description="Track content requests and approvals across the org."
        />
      );
    }
    if (activeView === "socialMetrics") {
      return (
        <Placeholder
          title="Social Metrics Dashboard"
          description="High-level social media performance placeholders."
        />
      );
    }
    return null;
  }

  return (
    <Layout
      isSidebarCollapsed={isSidebarCollapsed}
      sidebar={
        <Sidebar
          header={<div className="sidebar-title">Marketing Portal</div>}
          items={sidebarItems}
          activeId={activeView}
          onSelect={(id) => setActiveView(id as MarketingViewId)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        />
      }
      header={
        <Header
          title="Sales & Marketing Operating System"
          subtitle="Marketing view"
          userName={props.currentUser.name}
          roleLabel="Marketing"
          onLogout={props.onLogout}
        />
      }
    >
      {renderView()}
    </Layout>
  );
}
