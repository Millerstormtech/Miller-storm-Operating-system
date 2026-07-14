import { useRouter } from "next/router";
import { Sidebar } from "./Sidebar";
import { useAuth } from "../contexts/AuthContext";
import { useFeatureToggles } from "../hooks/useFeatureToggles";

// Sales Team Lead sidebar — the exact set of features they get (order matches
// the portal spec). Team Structure, Team Business Planners, Team Tasks and the
// Master Bot Builder are intentionally NOT here. (Raise a Ticket lives in the
// top bar, not the sidebar.)
const baseItems = [
  { id: "dashboard", label: "Sales Team Dashboard", toggleKey: "dashboard" },
  { id: "storm-chat", label: "StormChat", toggleKey: "stormChat" },
  { id: "course-leaderboard", label: "Course Leaderboard", toggleKey: "trainingCenter" },
  { id: "apps-tools", label: "Tools & Products", toggleKey: "appsTools" },
  { id: "rankings", label: "Sales Leaderboard", toggleKey: "rankings" },
  { id: "onlineTraining", label: "Training Center", toggleKey: "onlineTraining" },
  { id: "jays-ai-clone", label: "Jay's AI Clone", toggleKey: "aiChat" },
  { id: "my-profile", label: "Profile", toggleKey: "profile" },
];

type SalesTeamLeadSidebarProps = {
  activeId: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

export function SalesTeamLeadSidebar({ activeId, isCollapsed, onToggleCollapse }: SalesTeamLeadSidebarProps) {
  const router = useRouter();
  const { user } = useAuth();
  const featureToggles = useFeatureToggles(user?.id);

  const sidebarItems = featureToggles
    ? baseItems.filter(item => featureToggles[item.toggleKey] !== false)
    : baseItems;

  function handleNavigation(id: string) {
    router.push(`/manager/${id}`);
  }

  return (
    <Sidebar
      header={
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: '100%', marginTop: -30 }}>
          <img src="/ChatGPT_Image_Feb_23__2026__07_00_52_PM-removebg-preview.png" alt="Miller Storm" style={{ width: 160, height: 160, objectFit: 'contain', marginTop: -20, marginBottom: -40 }} />
        </div>
      }
      items={sidebarItems}
      activeId={activeId}
      onSelect={handleNavigation}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    />
  );
}
