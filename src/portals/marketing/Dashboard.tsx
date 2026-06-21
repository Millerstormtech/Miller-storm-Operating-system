import { DashboardCard } from "../../components/DashboardCard";

export function MarketingDashboard() {
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
