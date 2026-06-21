export type UserRole = "admin" | "manager" | "sales" | "marketing";

export type ModuleKey =
  | "dashboard"
  | "userManagement"
  | "roleHierarchy"
  | "businessUnits"
  | "salesOverview"
  | "marketingOverview"
  | "courseManagement"
  | "materialsLibrary"
  | "approvalWorkflows"
  | "aiBots"
  | "webTemplates"
  | "webText"
  | "appsTools"
  | "socialMediaMetrics"
  | "team"
  | "plans"
  | "training"
  | "onlineTraining"
  | "taskTracker"
  | "profile"
  | "plan"
  | "materials"
  | "aiChat"
  | "webPage"
  | "businessCards"
  | "assets"
  | "approvals"
  | "socialMetrics"
  | "featureToggles"
  | "systemSettings"
  | "teamBusinessPlans"
  | "teamFunnelMetrics"
  | "teamTraining"
  | "aiAssistant"
  | "businessPlan"
  | "trainingCenter"
  | "marketingMaterials"
  | "repWebPage"
  | "assetLibrary"
  | "contentApprovals"
  | "courseAiBots"
  | "messaging"
  | "leaderboard";

export type FeatureToggles = Record<ModuleKey, boolean>;

export type BusinessPlan = {
  revenueGoal: number;
  daysPerWeek: number;
  territories: string[];
  selectedPresetId?: string;
  averageDealSize?: number;
  dealsPerYear: number;
  dealsPerMonth: number;
  inspectionsNeeded: number;
  doorsPerYear: number;
  doorsPerDay: number;
  committed: boolean;
};

export type WebPageStatus = {
  status: "draft" | "pendingApproval" | "published" | "rejected";
  shortSlug?: string;
};

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  roles?: UserRole[];
  suspended?: boolean;
  deleted?: boolean;
  deletedAt?: string;
  createdAt?: string;
  managerId?: string;
  strengths: string;
  weaknesses: string;
  bio?: string;
  marketingMaterialsNotes?: string;
  missionTitle?: string;
  missionBody?: string;
  missionCtaLabel?: string;
  missionImageUrl?: string;
  whyUsTitle?: string;
  whyUsBody?: string;
  expertRoofersTitle?: string;
  expertRoofersBody?: string;
  headshotUrl?: string;
  phone?: string;
  territory?: string;
  businessPlan?: BusinessPlan;
  videoUrl?: string;
  webPage?: WebPageStatus;
  publicProfile: {
    showHeadshot: boolean;
    showEmail: boolean;
    showPhone: boolean;
    showStrengths: boolean;
    showWeaknesses: boolean;
    showTerritory: boolean;
  };
  featureToggles: FeatureToggles;
};

export type AuthenticatedUser = {
  id: string;
  name: string;
  role: UserRole;
};

export type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
};

export type LessonLink = {
  label: string;
  href: string;
};

export type CoursePage = {
  id: string;
  title: string;
  status: "draft" | "published";
  body: string;
  folderId?: string;
  videoUrl?: string;
  transcript?: string;
  pinnedCommunityPostUrl?: string;
  resourceLinks: LessonLink[];
  fileUrls: LessonLink[];
  isQuiz?: boolean;
  quizQuestions?: QuizQuestion[];
};

export type CourseFolder = {
  id: string;
  title: string;
  status: "draft" | "published";
};

export type Course = {
  id: string;
  title: string;
  tagline: string;
  description: string;
  lessonNames: string[];
  assetFiles: string[];
  marketingDocs: string[];
  icon: string;
  difficultyLabel: string;
  timeLabel: string;
  difficultyScore: number;
  timeScore: number;
  riskScore: number;
  capitalScore: number;
  personalityScore: number;
  quizQuestions: QuizQuestion[];
  links: LessonLink[];
  status?: "draft" | "published";
  coverImageUrl?: string;
  accessMode?: "open" | "assigned";
  folders?: CourseFolder[];
  pages?: CoursePage[];
  order?: number;
};
