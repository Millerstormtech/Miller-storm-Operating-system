import { useRouter } from "next/router";
import { Sidebar } from "./Sidebar";
import { useAuth } from "../contexts/AuthContext";
import { useFeatureToggles } from "../hooks/useFeatureToggles";

// Branch Manager (executive) panel navigation. Company-wide view — every item shows the
// whole organization, not a single team. Each item carries a feature-toggle key so
// an admin can hide any page for this user from User Management.
const baseItems = [
  { id: "dashboard", label: "Branch Manager Dashboard", toggleKey: "dashboard" },
  { id: "storm-chat", label: "StormChat", toggleKey: "stormChat" },
  { id: "course-leaderboard", label: "Course Leaderboard", toggleKey: "trainingCenter" },
  { id: "user-management", label: "User Management", toggleKey: "userManagement" },
  { id: "apps-tools", label: "Tools & Products", toggleKey: "appsTools" },
  { id: "sales-leaderboard", label: "Sales Leaderboard", toggleKey: "leaderboard" },
  { id: "training", label: "Training Center", toggleKey: "training" },
  { id: "jays-ai-clone", label: "Jay's AI Clone", toggleKey: "aiChat" },
  { id: "my-profile", label: "Profile", toggleKey: "profile" },
];

type BranchManagerSidebarProps = {
  activeId: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

export function BranchManagerSidebar({ activeId, isCollapsed, onToggleCollapse }: BranchManagerSidebarProps) {
  const router = useRouter();
  const { user } = useAuth();
  const featureToggles = useFeatureToggles(user?.id);

  // Hide any page whose feature toggle is explicitly turned off for this user.
  const sidebarItems = featureToggles
    ? baseItems.filter(item => featureToggles[item.toggleKey] !== false)
    : baseItems;

  function handleNavigation(id: string) {
    // Clicking "Training Center" while already on it returns to the course list.
    if (id === "training" && router.pathname === "/branch-manager/training") {
      window.dispatchEvent(new CustomEvent("reset-training-view"));
      return;
    }
    router.push(`/branch-manager/${id}`);
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
