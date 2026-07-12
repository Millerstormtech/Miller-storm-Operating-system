import { useRouter } from "next/router";
import { Sidebar } from "./Sidebar";

// C-Level (executive) panel navigation. Company-wide view — every item shows the
// whole organization, not a single team. Feature set was defined by the client.
const baseItems = [
  { id: "dashboard", label: "C-Level Dashboard" },
  { id: "course-leaderboard", label: "Course Leaderboard" },
  { id: "team-structure", label: "Team Structure" },
  { id: "apps-tools", label: "Apps & Tools Builder" },
  { id: "training", label: "Training Center" },
  { id: "sales-leaderboard", label: "Sales Leaderboard" },
  { id: "storm-chat", label: "StormChat" },
  { id: "jays-ai-clone", label: "Jay's AI Clone" },
  { id: "my-profile", label: "Profile" },
];

type CLevelSidebarProps = {
  activeId: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

export function CLevelSidebar({ activeId, isCollapsed, onToggleCollapse }: CLevelSidebarProps) {
  const router = useRouter();

  function handleNavigation(id: string) {
    router.push(`/c-level/${id}`);
  }

  return (
    <Sidebar
      header={
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: '100%', marginTop: -30 }}>
          <img src="/ChatGPT_Image_Feb_23__2026__07_00_52_PM-removebg-preview.png" alt="Miller Storm" style={{ width: 160, height: 160, objectFit: 'contain', marginTop: -20, marginBottom: -40 }} />
        </div>
      }
      items={baseItems}
      activeId={activeId}
      onSelect={handleNavigation}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    />
  );
}
