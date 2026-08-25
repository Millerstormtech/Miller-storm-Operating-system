export type UserRole = "admin" | "sales-team-lead" | "sales" | "marketing" | "c-level" | "branch-manager";

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
  | "leaderboard"
  | "teamStructure"
  | "stormChat"
  | "emailConfig"
  | "rankings";

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
  // A user can belong to more than one branch. `territory` stays the primary
  // (first) branch for single-branch logic; `branches` holds the full set.
  branches?: string[];
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
  // When true, this is a test/demo account: hidden from every people-facing
  // view (org chart, leaderboards, dashboards, directory).
  testAccount?: boolean;
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
  // Marks the course's cumulative Final Test (exactly one per course). MUST stay
  // on this type: the Course Builder saves whole course documents through
  // /api/courses/bulk, which $sets the entire `pages` array, so any field missing
  // from this shape is silently stripped from every page on save. Leaving it off
  // is what made the Test Ace badge unearnable across the whole library.
  isFinalTest?: boolean;
  quizQuestions?: QuizQuestion[];
  // For quizzes: how many questions (randomly chosen from quizQuestions) to
  // actually show the user. Undefined / 0 / >= total means show them all.
  questionsToShow?: number;
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
  // Training Center grouping heading. Empty/undefined = Uncategorized.
  category?: string;
  // When true, every lesson & quiz is unlocked for ALL users (no sequential
  // gating). When false, only leadership roles get it unlocked.
  unlockAll?: boolean;
  folders?: CourseFolder[];
  pages?: CoursePage[];
  order?: number;
};
