import { useState, useMemo, useEffect, useRef } from "react";
import { appConfirm } from "../../lib/appDialogs";
import { useRouter } from "next/router";
import { Course } from "../../types";
import { LessonAIChat } from "../../components/LessonAIChat";
import { LessonTick } from "../../components/LessonTick";
import { useAuth } from "../../contexts/AuthContext";
import { ShareModal } from "../../components/ShareModal";
import { Toast } from "../../components/Toast";
import { initVideoSequence } from "../../hooks/useVideoSequence";
import { enableGlobalAutoplay } from "../../utils/autoplayEnabler";
import { lessonCount } from "../../lib/training/scoring";
import { groupCoursesByCategory, UNCATEGORIZED_LABEL } from "../../lib/training/categories";
import { QUIZ_PASS_THRESHOLD, QUIZ_MAX_ATTEMPTS, quizPct, quizPercent, isQuizResultPassing, selectQuizQuestions } from "../../lib/quiz";
import { submitQuizAttempt, reviewToCorrectnessMap } from "../../lib/training/quiz-client";
import { GuidedTour } from "../shared/guided-tour/GuidedTour";
import { TRAINING_CENTER_TOUR } from "../shared/guided-tour/definitions/trainingCenter";
import { TRAINING_COURSE_TOUR } from "../shared/guided-tour/definitions/trainingCourse";

// Order pages to match the folder-grouped sidebar display: non-folder pages
// first, then each folder's pages (in folder order), then any orphaned pages.
// Navigation (Next) and the lock check MUST use this SAME order as the sidebar —
// otherwise "Next" follows the raw array order and can jump across modules,
// skipping the rest of a module's lessons + its quiz (so the quiz never unlocks).
function orderPagesByFolder(pages: any[], folders: any[]): any[] {
  const known = new Set((folders || []).map((f: any) => f.id));
  return [
    ...pages.filter((p: any) => !p.folderId),
    ...(folders || []).flatMap((f: any) => pages.filter((p: any) => p.folderId === f.id)),
    ...pages.filter((p: any) => p.folderId && !known.has(p.folderId)),
  ];
}

// Whether a page is unlocked for the user: a manager unlock always opens it,
// otherwise strict sequential — every preceding item (lesson watched / quiz
// passed) must be complete. Kept in sync with the in-view isPageUnlocked; used
// by the deep-link resolver to decide whether to open the lesson or just land
// on the course overview.
function isPageUnlockedFor(
  pageId: string,
  orderedPages: any[],
  unlockedPages: Set<string>,
  completedPages: Set<string>,
  savedQuizResults: any[]
): boolean {
  if (unlockedPages.has(pageId)) return true;
  // Once completed, a lesson/quiz NEVER re-locks — even if a new item is
  // inserted before it or a preceding item now looks incomplete.
  const self = orderedPages.find((p) => p.id === pageId);
  if (self && (self.isQuiz
    ? isQuizResultPassing(savedQuizResults.find((r) => r.pageId === pageId))
    : completedPages.has(pageId))) return true;
  const idx = orderedPages.findIndex((p) => p.id === pageId);
  if (idx <= 0) return true;
  for (let i = 0; i < idx; i++) {
    const prev = orderedPages[i];
    if (prev.isQuiz) {
      if (!isQuizResultPassing(savedQuizResults.find((r) => r.pageId === prev.id))) return false;
    } else if (!completedPages.has(prev.id)) {
      return false;
    }
  }
  return true;
}

// Progress counts BOTH lessons (completed) and quizzes (passed) out of ALL
// published pages — so adding a new quiz drops % below 100% until it's passed.
function computeItemProgress(
  publishedPages: any[],
  completed: Set<string>,
  quizResults: any[],
  courseCompletedFlag = false
) {
  const total = publishedPages.length;
  const done = publishedPages.filter((p: any) =>
    p.isQuiz
      ? isQuizResultPassing(quizResults.find((r: any) => r.pageId === p.id))
      : completed.has(p.id)
  ).length;
  // isCompleted reflects ACTUAL completion only — we deliberately ignore any
  // stale stored courseCompleted flag, so adding new lessons/quizzes to an
  // already-finished course drops it below 100% instead of showing "✓ 100%".
  return { completed: done, total, isCompleted: total > 0 && done >= total };
}

type Playlist = {
  id: string;
  _id?: string; // MongoDB ID
  name: string;
  courseId: string;
  courseName: string;
  selectedModules: string[];
  createdAt: string;
};

export function TrainingCenter(props: { courses: Course[]; isLoading?: boolean }) {
  const { user } = useAuth();
  const router = useRouter();
  const courses = props.courses;
  const isLoading = props.isLoading || false;
  const [search, setSearch] = useState("");
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [courseViewInitialized, setCourseViewInitialized] = useState<string | null>(null);
  const [showAIChat, setShowAIChat] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [completedPages, setCompletedPages] = useState<Set<string>>(new Set());
  // Pages a manager manually unlocked for this user (accessible without watching).
  const [unlockedPages, setUnlockedPages] = useState<Set<string>>(new Set());
  // Course id whose progress (completed/unlocked/quiz) has finished loading —
  // lets the deep-link resolver wait until lock status is actually known.
  const [progressLoadedCourseId, setProgressLoadedCourseId] = useState<string | null>(null);
  // Lesson a deep link (notification / pop-up) wants to open, pending a lock check.
  const pendingDeepLinkRef = useRef<string | null>(null);
  const [seekToast, setSeekToast] = useState<string | null>(null);
  // Whether a manager/admin/C-Level has granted this rep free fast-forward. Kept
  // in a ref too so the async video-init callback always reads the latest value.
  const fastForwardRef = useRef(false);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState<{ correct: number; total: number } | null>(null);
  // questionId -> was the rep's OWN answer correct, from the server's grading
  // reply. It deliberately does not say what the right answer was.
  const [quizReview, setQuizReview] = useState<Record<string, boolean>>({});
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  // Set when the rep dismisses the fail dialog to read their answers. It keeps
  // the pending action (retry, or go relearn the lesson) available on the review
  // screen, so dismissing the dialog is never a dead end.
  const [quizFailAction, setQuizFailAction] = useState<{ mode: 'retry' | 'relearn'; pageId: string; prevLessonId: string | null } | null>(null);
  const [savedQuizResults, setSavedQuizResults] = useState<any[]>([]);
  // Quiz gating: failed-attempt counter, shuffled question order per quiz, and
  // the pass/fail modal ("try again" or "relearn the lesson").
  const [quizAttempts, setQuizAttempts] = useState<Record<string, number>>({});
  const [quizQuestionOrder, setQuizQuestionOrder] = useState<Record<string, any[]>>({});
  const [quizModal, setQuizModal] = useState<{ mode: 'retry' | 'relearn'; pageId: string; pct: number; prevLessonId: string | null } | null>(null);
  const [courseCompleted, setCourseCompleted] = useState(false);
  const [activeTab, setActiveTab] = useState<'courses' | 'myPlaylists' | 'assignedPlaylists'>('courses');
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [viewingPlaylist, setViewingPlaylist] = useState<Playlist | null>(null);
  const [assignedPlaylists, setAssignedPlaylists] = useState<any[]>([]);
  const [unreadAssignedCount, setUnreadAssignedCount] = useState(0);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(280);
  const [isFirstPageVisit, setIsFirstPageVisit] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showCourseMenu, setShowCourseMenu] = useState(false);
  const [mobileCourseScreen, setMobileCourseScreen] = useState<'overview' | 'lesson'>('overview');
  const [courseBot, setCourseBot] = useState<{ trainingText?: string; selectedPages?: string[] } | null>(null);
  // The course list is loaded "summary only" (no lesson bodies/transcripts/quizzes)
  // for speed; when a course is opened we fetch its full content on demand.
  const [isCourseLoading, setIsCourseLoading] = useState(false);

  // Open a course: the list only carries lightweight page metadata, so fetch the
  // full course (lesson bodies, transcripts, quiz questions) from the detail
  // endpoint before showing CourseView. `initialPageId` is computed by the caller
  // from the summary metadata (which lesson to land on).
  async function enterCourse(baseCourse: Course, initialPageId: string | null, playlist: Playlist | null = null) {
    setViewingPlaylist(playlist);
    setActivePageId(initialPageId);
    setCourseViewInitialized(null);
    setIsCourseLoading(true);
    // Modules start CLOSED every time a course is opened (not just the first).
    setCollapsedFolders(new Set((baseCourse.folders ?? []).map(f => f.id)));
    try {
      const res = await fetch(`/api/courses/${baseCourse.id}${user?.id ? `?userId=${user.id}` : ''}`);
      const full = res.ok ? await res.json() : null;
      const resolved = full && full.id ? full : baseCourse;
      setSelectedCourse(resolved);
      // Collapse the hydrated folder set too (summary course may have had none).
      setCollapsedFolders(new Set((resolved.folders ?? []).map((f: any) => f.id)));
    } catch (err) {
      console.error('Failed to load full course, falling back to summary data:', err);
      setSelectedCourse(baseCourse);
    } finally {
      setIsCourseLoading(false);
    }
  }

  // Refs for video sequencing (must live at top level, not inside CourseView)
  const videoCleanupRef = useRef<(() => void) | undefined>(undefined);
  const videoCallbackRef = useRef<(() => void) | undefined>(undefined);
  // True when the page change was triggered by a video ending (so next lesson's video should auto-start)
  const autoTriggeredRef = useRef(false);
  const [autoPlay, setAutoPlay] = useState<boolean>(() => {
    // Autoplay defaults to OFF for everyone; it's ON only if the user explicitly
    // turned it on (stored as 'true'). Absent/'false' → OFF.
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sales-autoplay') === 'true';
    }
    return false;
  });
  // Ref so the video sequence always reads the live autoPlay value without re-initing
  const autoPlayRef = useRef(autoPlay);
  autoPlayRef.current = autoPlay;

  // Handle lessonId from query parameter (e.g. the "Check it out" pop-up or a
  // shared lesson link). Depends on router.query.lessonId — NOT just courses —
  // so it fires even when the URL changes while the user is already on this
  // page (router.push to the same route does not remount, so a courses-only
  // dependency never re-ran and the redirect silently did nothing).
  const handledLessonRef = useRef<string | null>(null);
  useEffect(() => {
    // Enable global autoplay for all devices
    enableGlobalAutoplay();

    const getParam = (key: string) => {
      const v = router.query[key];
      const fromRouter = Array.isArray(v) ? v[0] : v;
      return fromRouter ?? (typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get(key)
        : null);
    };
    const courseId = getParam('courseId');
    const lessonId = getParam('lessonId');
    if (courses.length === 0) return;

    // Prefer courseId (always present on the notification, even older ones);
    // fall back to finding the course that contains the lesson.
    const targetCourse = courseId
      ? courses.find(c => c.id === courseId)
      : (lessonId ? courses.find(c => c.pages?.some(p => p.id === lessonId)) : undefined);
    if (!targetCourse) return;

    // Handle a given course/lesson only once — courses re-fetches (progress
    // saves, etc.) must not yank the user back into the player.
    const key = `${courseId || ''}::${lessonId || ''}`;
    if (handledLessonRef.current === key) return;
    handledLessonRef.current = key;

    // Enter the course now; a resolver opens the lesson only if it's unlocked
    // (a locked lesson — or no lesson id — just lands on the course overview).
    pendingDeepLinkRef.current = lessonId || null;
    enterCourse(targetCourse, lessonId ?? (targetCourse.pages?.[0]?.id ?? null));
  }, [courses, router.query.courseId, router.query.lessonId]);
  // Deep-link from a "playlist assigned" notification: open the Assigned
  // Playlists tab.
  useEffect(() => {
    if (router.query.tab === 'assignedPlaylists') {
      setActiveTab('assignedPlaylists');
    }
  }, [router.query.tab]);
  // Load this rep's fast-forward grant (set by a manager/admin/C-Level).
  useEffect(() => {
    if (!user?.id) return;
    fetch(`/api/users/${user.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(u => { fastForwardRef.current = !!u?.fastForwardAllowed; })
      .catch(() => {});
  }, [user?.id]);

  // Load playlists from database
  useEffect(() => {
    if (user?.id) {
      fetch(`/api/playlists?managerId=${user.id}`)
        .then(res => res.json())
        .then(data => {
          console.log('Playlists loaded:', data);
          // Convert MongoDB _id to id for compatibility
          const formattedPlaylists = data.map((p: any) => ({
            ...p,
            id: p._id || p.id,
          }));
          setPlaylists(formattedPlaylists);
        })
        .catch(err => console.error('Failed to load playlists:', err));
    }
  }, [user?.id]);

  // Load assigned playlists from API
  useEffect(() => {
    if (user?.id) {
      fetch(`/api/playlist-assignments?userId=${user.id}`)
        .then(res => res.json())
        .then(data => {
          setAssignedPlaylists(data);
          // Badge = how many assignments arrived since the rep last opened this
          // tab (count delta). This re-badges for every NEW assignment, unlike a
          // one-shot "viewed" flag.
          const seenRaw = localStorage.getItem(`assigned-playlists-seen-${user.id}`);
          const seen = seenRaw ? (parseInt(seenRaw, 10) || 0) : 0;
          setUnreadAssignedCount(Math.max(0, (Array.isArray(data) ? data.length : 0) - seen));
        })
        .catch(err => console.error('Failed to load assigned playlists:', err));
    }
  }, [user?.id]);

  // Clicking "Training Center" in the sidebar while already on this page (i.e.
  // while inside a course) returns to the course list. The sidebar dispatches
  // this event because same-route navigation doesn't remount the component.
  useEffect(() => {
    const resetToCourseList = () => {
      setSelectedCourse(null);
      setActivePageId(null);
      setViewingPlaylist(null);
    };
    window.addEventListener('reset-training-view', resetToCourseList);
    return () => window.removeEventListener('reset-training-view', resetToCourseList);
  }, []);

  useEffect(() => {
    if (selectedCourse) {
      // Enter on the overview; the deep-link resolver upgrades to the lesson
      // view only when the target lesson is actually unlocked.
      setMobileCourseScreen('overview');
      fetch('/api/course-ai-bots')
        .then(r => r.json())
        .then((bots: any[]) => {
          console.log('All bots:', bots);
          console.log('Selected course ID:', selectedCourse.id);
          const published = bots.find(b => b.status === 'published' && b.selectedCourses?.includes(selectedCourse.id));
          console.log('Found published bot for this course:', published);
          if (published) {
            console.log('Bot selectedPages:', published.selectedPages);
          }
          setCourseBot(published || null);
        })
        .catch(() => setCourseBot(null));
    } else {
      setCourseBot(null);
    }
  }, [selectedCourse?.id]);

  // When the user leaves a course they opened via a deep link, strip the
  // courseId/lessonId params so the URL reflects the course list (and a refresh
  // on the list doesn't silently re-open the course).
  const wasInCourseRef = useRef(false);
  useEffect(() => {
    if (selectedCourse) { wasInCourseRef.current = true; return; }
    if (!wasInCourseRef.current) return;
    wasInCourseRef.current = false;
    if (router.query.courseId || router.query.lessonId) {
      const q = { ...router.query };
      delete q.courseId;
      delete q.lessonId;
      router.replace({ pathname: router.pathname, query: q }, undefined, { shallow: true });
    }
  }, [selectedCourse?.id]);

  useEffect(() => {
    if (selectedCourse && user) {
      fetch(`/api/progress?userId=${user.id}&courseId=${selectedCourse.id}`)
        .then(res => res.json())
        .then(data => {
          setCompletedPages(new Set(data.completedPages || []));
          setUnlockedPages(new Set(data.unlockedPages || []));
          setSavedQuizResults(data.quizResults || []);
          setCourseCompleted(data.courseCompleted || false);
          if (selectedCourse) setProgressLoadedCourseId(selectedCourse.id);
        })
        .catch(err => console.error("Failed to load progress:", err));
    }
  }, [selectedCourse, user]);

  // Deep-link resolver: once this course's progress (lock status) is known,
  // open the target lesson if it's unlocked; a locked target leaves the user on
  // the course overview (they still land inside the course, where the lesson is).
  useEffect(() => {
    const target = pendingDeepLinkRef.current;
    if (!target || !selectedCourse) return;
    if (progressLoadedCourseId !== selectedCourse.id) return; // wait for lock status
    const ordered = orderPagesByFolder(
      (selectedCourse.pages ?? []).filter(p => p.status === 'published'),
      selectedCourse.folders ?? []
    );
    if (!ordered.some(p => p.id === target)) { pendingDeepLinkRef.current = null; return; }
    const unlocked = selectedCourse?.unlockAll || isPageUnlockedFor(target, ordered, unlockedPages, completedPages, savedQuizResults);
    setActivePageId(target);
    setMobileCourseScreen(unlocked ? 'lesson' : 'overview');
    pendingDeepLinkRef.current = null;
  }, [progressLoadedCourseId, selectedCourse, unlockedPages, completedPages, savedQuizResults]);

  // Collapse all folders by default when entering a course; expand only the active lesson's folder
  // Collapse all folders by default when entering a course
  useEffect(() => {
    if (!selectedCourse || courseViewInitialized === selectedCourse.id) return;
    const folders = selectedCourse.folders ?? [];
    if (folders.length === 0) return;
    setCollapsedFolders(new Set(folders.map(f => f.id)));
    setCourseViewInitialized(selectedCourse.id);
  }, [selectedCourse, activePageId, courseViewInitialized]);

  useEffect(() => {
    if (!activePageId || !selectedCourse) return;
    const pages = selectedCourse.pages ?? [];
    const page = pages.find(p => p.id === activePageId);
    if (!page) return;
    
    const savedResult = savedQuizResults.find(r => r.pageId === page.id);
    if (savedResult) {
      setSelectedAnswers(savedResult.answers);
      setQuizScore(savedResult.score);
      // Results saved before server-side grading carry no review; an empty map
      // means "no marking available", never "every answer was wrong".
      setQuizReview(reviewToCorrectnessMap(savedResult.review || []));
      setQuizSubmitted(true);
    } else {
      setQuizSubmitted(false);
      setQuizScore(null);
      setQuizReview({});
      setQuizFailAction(null);
      setSelectedAnswers({});
    }

    // Give each quiz a shuffled question order (per user, per attempt).
    if (page.isQuiz && page.quizQuestions && page.quizQuestions.length > 0) {
      setQuizQuestionOrder(prev => prev[page.id] ? prev : { ...prev, [page.id]: selectQuizQuestions(page.quizQuestions!, page.questionsToShow) });
    }

  }, [activePageId, savedQuizResults, selectedCourse]);

  // Resizer functionality
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const delta = e.clientX - startX;
      const newWidth = startWidth + delta;
      if (newWidth >= 200 && newWidth <= 600) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, startX, startWidth]);

  // ── Video auto-advance (parent level so effect is stable) ──────────────────
  // Use a ref for the callback so it always has fresh state without re-running the effect
  const onVideoEndedRef = useRef<(navigate: boolean) => void>(() => {});

  // Keep the ref updated on every render with fresh closure values
  onVideoEndedRef.current = (navigate: boolean) => {
    console.log('[TrainingCenter] onVideoEndedRef called - navigate:', navigate);
    if (!selectedCourse) {
      console.log('[TrainingCenter] No selected course, returning');
      return;
    }
    let currentPages = (selectedCourse.pages ?? []).filter(p => p.status === 'published');
    if (viewingPlaylist) {
      currentPages = currentPages.filter(p => viewingPlaylist.selectedModules.includes(p.id));
    }
    // Match the folder-grouped sidebar order so "next" goes to the visually-next page.
    currentPages = orderPagesByFolder(currentPages, selectedCourse.folders ?? []);
    const currentIndex = currentPages.findIndex(p => p.id === activePageId);
    console.log(`[TrainingCenter] Current page index: ${currentIndex}, activePageId: ${activePageId}`);
    if (currentIndex === -1) {
      console.log('[TrainingCenter] Current page not found, returning');
      return;
    }

    const currentPage = currentPages[currentIndex];
    console.log(`[TrainingCenter] Current page: ${currentPage.title}, isQuiz: ${currentPage.isQuiz}`);
    if (!currentPage.isQuiz) {
      const newCompleted = new Set([...completedPages, currentPage.id]);
      setCompletedPages(newCompleted);
      setCourseProgress(prev => ({
        ...prev,
        [selectedCourse.id]: computeItemProgress(currentPages, newCompleted, savedQuizResults, prev[selectedCourse.id]?.isCompleted),
      }));
      if (user) {
        fetch('/api/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            courseId: selectedCourse.id,
            completedPages: Array.from(newCompleted)
          })
        }).catch(() => {});
      }
    }

    // navigate === false → the video hit its last 5s: only unlock/enable Next
    // (done above via setCompletedPages). Auto-advance ONLY on the true end.
    if (navigate && currentIndex < currentPages.length - 1) {
      autoTriggeredRef.current = true; // mark that this navigation came from video ending
      setActivePageId(currentPages[currentIndex + 1].id);
      const nextPage = currentPages[currentIndex + 1];
      if (nextPage.folderId) {
        setCollapsedFolders(prev => {
          const next = new Set(prev);
          next.delete(nextPage.folderId!);
          return next;
        });
      }
      document.querySelector('.course-page-main')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Effect only re-runs when the page or autoPlay changes — initialises the sequence
  useEffect(() => {
    if (!selectedCourse || !activePageId) return;

    let pages = (selectedCourse.pages ?? []).filter(p => p.status === 'published');
    if (viewingPlaylist) {
      pages = pages.filter(p => viewingPlaylist.selectedModules.includes(p.id));
    }
    const activePage = pages.find(p => p.id === activePageId);
    if (!activePage || activePage.isQuiz) return;

    videoCleanupRef.current?.();
    videoCleanupRef.current = undefined;

    const timer = setTimeout(async () => {
      const container = document.querySelector<HTMLElement>('.course-page-body-input');
      if (!container) {
        console.log('[VideoSeq] container .course-page-body-input not found');
        return;
      }
      const shouldAutoStart = autoTriggeredRef.current;
      autoTriggeredRef.current = false; // reset after reading
      // "Unlock all" also lets everyone fast-forward/skip freely (as if the
      // video were already completed).
      const isAlreadyCompleted = !!selectedCourse?.unlockAll || (activePageId ? completedPages.has(activePageId) : false);
      const cleanup = await initVideoSequence(
        container,
        (navigate: boolean) => onVideoEndedRef.current(navigate),
        autoPlayRef,
        shouldAutoStart,
        isAlreadyCompleted,
        () => setSeekToast("You are only able to fast forward if you already completed the video at least once before."),
        fastForwardRef.current
      );
      videoCleanupRef.current = cleanup;

      // If no videos were found on this page, mark it as completed so the user can advance
      if (!cleanup && !isAlreadyCompleted && activePageId) {
        console.log('[VideoSeq] No videos found on this page, marking as completed');
        const newCompleted = new Set([...completedPages, activePageId]);
        setCompletedPages(newCompleted);
        
        // Update the card progress state immediately
        let pages = (selectedCourse.pages ?? []).filter(p => p.status === 'published');
        if (viewingPlaylist) {
          pages = pages.filter(p => viewingPlaylist.selectedModules.includes(p.id));
        }
        setCourseProgress(prev => ({
          ...prev,
          [selectedCourse.id]: computeItemProgress(pages, newCompleted, savedQuizResults, prev[selectedCourse.id]?.isCompleted),
        }));

        if (user) {
          fetch('/api/progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.id,
              courseId: selectedCourse.id,
              completedPages: Array.from(newCompleted)
            })
          }).catch(() => {});
        }
      }
    }, 1200);

    return () => {
      clearTimeout(timer);
      videoCleanupRef.current?.();
      videoCleanupRef.current = undefined;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePageId, selectedCourse?.id, viewingPlaylist?.id, mobileCourseScreen, completedPages]);

  const filteredCourses = useMemo(() => {
    const term = search.toLowerCase();
    if (!term) {
      return courses;
    }
    return courses.filter((course: Course) => {
      const inTitle = (course.title || "").toLowerCase().includes(term);
      // lessonNames/assetFiles are absent in the list-mode API payload, so guard them.
      const inLessons = (course.lessonNames || []).some((name) =>
        (name || "").toLowerCase().includes(term)
      );
      const inAssets = (course.assetFiles || []).some((file) =>
        (file || "").toLowerCase().includes(term)
      );
      // Also match individual videos/lessons inside the course.
      const inVideos = (course.pages || []).some((p) =>
        p && p.status === "published" && !p.isQuiz && (p.title || "").toLowerCase().includes(term)
      );
      return inTitle || inLessons || inAssets || inVideos;
    });
  }, [courses, search]);

  const [courseProgress, setCourseProgress] = useState<Record<string, { completed: number; total: number; isCompleted: boolean }>>({});
  // Per-course raw completed pages + last-touched time — used to compute the
  // "Continue where you left off" resume target (next unwatched lesson).
  const [courseCompletedMap, setCourseCompletedMap] = useState<Record<string, Set<string>>>({});
  const [courseUpdatedMap, setCourseUpdatedMap] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!user || courses.length === 0) return;

    const loadProgress = async () => {
      try {
        // Batch load all progress in one API call
        const courseIds = courses.map(c => c.id).join(',');
        const res = await fetch(`/api/course-progress?userId=${user.id}&courseIds=${courseIds}`);

        if (res.ok) {
          const data = await res.json();
          const progressMap: Record<string, { completed: number; total: number; isCompleted: boolean }> = {};
          const completedMap: Record<string, Set<string>> = {};
          const updatedMap: Record<string, number> = {};

          courses.forEach(course => {
            const courseData = data[course.id] || {};
            const publishedPages = (course.pages || []).filter(p => p.status === 'published');
            progressMap[course.id] = computeItemProgress(
              publishedPages,
              new Set(courseData.completedPages || []),
              courseData.quizResults || [],
              courseData.courseCompleted
            );
            completedMap[course.id] = new Set<string>(courseData.completedPages || []);
            updatedMap[course.id] = courseData.updatedAt ? new Date(courseData.updatedAt).getTime() : 0;
          });

          setCourseProgress(progressMap);
          setCourseCompletedMap(completedMap);
          setCourseUpdatedMap(updatedMap);
        }
      } catch (err) {
        console.error('Failed to load progress:', err);
      }
    };

    loadProgress();
  }, [courses, user]);

  // The single course/lesson to resume: the most recently touched course that's
  // started but not finished, jumped to its first not-yet-watched published
  // lesson (falling back to the next incomplete item, then the first page).
  const resumeTarget = useMemo(() => {
    if (!courses.length) return null;
    const started = courses
      .map(c => ({
        course: c,
        prog: courseProgress[c.id],
        done: courseCompletedMap[c.id] || new Set<string>(),
        updated: courseUpdatedMap[c.id] || 0,
      }))
      .filter(x => x.prog && x.prog.completed > 0 && !x.prog.isCompleted)
      .sort((a, b) => b.updated - a.updated);
    const pick = started[0];
    if (!pick) return null;
    const pages = (pick.course.pages ?? []).filter(p => p.status === 'published');
    const next =
      pages.find(p => !p.isQuiz && !pick.done.has(p.id)) ||
      pages.find(p => !pick.done.has(p.id)) ||
      pages[0];
    if (!next) return null;
    return { course: pick.course, pageId: next.id, lessonTitle: next.title || '', courseTitle: pick.course.title };
  }, [courses, courseProgress, courseCompletedMap, courseUpdatedMap]);

  // Segmented red-pill tab style: solid brand red when active, subtle outline
  // otherwise.
  const tabPill = (active: boolean): React.CSSProperties => ({
    padding: '10px 22px',
    borderRadius: 999,
    fontFamily: '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif',
    fontSize: 15,
    fontWeight: 800,
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    border: active ? 'none' : '1px solid var(--border-default)',
    background: active ? 'linear-gradient(90deg, #b30002, #e01418)' : 'transparent',
    color: active ? '#fff' : 'var(--text-muted)',
    boxShadow: active ? '0 3px 10px rgba(202,0,2,0.3)' : 'none',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  });

  return (
    <>
      {/* Share Modal - Render at top level */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        title={selectedCourse?.pages?.find(p => p.id === activePageId)?.title || 'Lesson'}
        shareUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}/share/lesson/${activePageId || ''}`}
        lessonId={activePageId || ''}
      />

      {seekToast && (
        <Toast message={seekToast} type="info" duration={4000} onClose={() => setSeekToast(null)} />
      )}

      <div className={`training-center${selectedCourse ? (mobileCourseScreen === 'lesson' ? ' mobile-lesson-active' : ' mobile-overview-active') : ''}`}>
        {/* Always show tabs */}
      <div data-tour="tabs" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginTop: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => {
              setActiveTab('courses');
              if (selectedCourse) {
                setSelectedCourse(null);
                setActivePageId(null);
                setViewingPlaylist(null);
                setCourseViewInitialized(null);
              }
            }}
            style={tabPill(activeTab === 'courses')}
          >
            Courses
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('myPlaylists');
              if (selectedCourse) {
                setSelectedCourse(null);
                setActivePageId(null);
                setViewingPlaylist(null);
                setCourseViewInitialized(null);
              }
            }}
            style={tabPill(activeTab === 'myPlaylists')}
          >
            My Playlists
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('assignedPlaylists');
              if (selectedCourse) {
                setSelectedCourse(null);
                setActivePageId(null);
                setViewingPlaylist(null);
                setCourseViewInitialized(null);
              }
              // Mark as viewed: remember the current assignment count so only
              // FUTURE assignments re-badge.
              if (user?.id) {
                localStorage.setItem(`assigned-playlists-seen-${user.id}`, String(assignedPlaylists.length));
                setUnreadAssignedCount(0);
              }
            }}
            style={tabPill(activeTab === 'assignedPlaylists')}
          >
            Assigned Playlists
            {unreadAssignedCount > 0 && (
              <span style={{
                backgroundColor: activeTab === 'assignedPlaylists' ? 'rgba(255,255,255,0.28)' : '#ef4444',
                color: 'white',
                borderRadius: '50%',
                minWidth: 22,
                height: 22,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                padding: '0 5px'
              }}>
                {unreadAssignedCount}
              </span>
            )}
          </button>
        </div>
        {/* Search moved to the end of the tab row. */}
        <input
          className="field-input"
          data-tour="search"
          placeholder="Search courses and lessons"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 300, borderRadius: 999, padding: '11px 20px' }}
        />
      </div>
      {/* Exactly one tour is mounted per visible view, so there is never more
          than one "?" or auto-start candidate, and the header's "?" always
          restarts whichever view is on screen. */}
      {/* `key` forces a fresh instance when the view swaps, so no tour state
          (open step, measured rect) leaks from the library tour into the
          course tour. Without it React reuses the same instance. */}
      {selectedCourse
        ? <GuidedTour key="training-course" tour={TRAINING_COURSE_TOUR} ready={!isCourseLoading} />
        : <GuidedTour key="training-center" tour={TRAINING_CENTER_TOUR} ready={!isLoading} />}

      {isCourseLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
            <div style={{ color: 'var(--text-muted)' }}>Loading course...</div>
          </div>
        </div>
      ) : selectedCourse ? (
        CourseView()
      ) : (
        TabContent()
      )}
    </div>
    </>
  );

  function TabContent() {
    if (activeTab === 'courses') {
      return (
        <>
          {/* Resume banner: jumps straight to the next unwatched lesson of the
              course the rep most recently left unfinished. */}
          {resumeTarget && !isLoading && (
            <>
              <style>{`
                @keyframes tcResumeShine { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
                @keyframes tcResumePulse { 0%,100% { box-shadow: 0 10px 26px rgba(202,0,2,0.35); } 50% { box-shadow: 0 14px 34px rgba(202,0,2,0.55); } }
                .tc-resume { position: relative; overflow: hidden; width: 100%; display: flex; align-items: center; gap: 16px; padding: 16px 20px; margin: -22px 0 6px; border: none; border-radius: 16px; cursor: pointer; text-align: left;
                  background: linear-gradient(90deg, #b30002, #e01418, #b30002); background-size: 200% 100%; animation: tcResumeShine 6s linear infinite, tcResumePulse 2.8s ease-in-out infinite; transition: transform .15s ease; }
                .tc-resume:hover { transform: translateY(-2px); }
                .tc-resume-play { flex-shrink: 0; width: 44px; height: 44px; border-radius: 50%; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-size: 18px; color: #fff; }
                .tc-resume-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
                .tc-resume-title { font-family: "Arial Narrow","Roboto Condensed","Helvetica Neue",Arial,sans-serif; font-size: 19px; font-weight: 800; letter-spacing: 0.3px; color: #fff; }
                .tc-resume-sub { font-size: 13px; color: rgba(255,255,255,0.85); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .tc-resume-arrow { flex-shrink: 0; font-size: 22px; color: #fff; }
              `}</style>
              <button type="button" className="tc-resume" onClick={() => enterCourse(resumeTarget.course, resumeTarget.pageId)}>
                <span className="tc-resume-play">▶</span>
                <span className="tc-resume-text">
                  <span className="tc-resume-title">Continue where you left off!</span>
                  <span className="tc-resume-sub">
                    {resumeTarget.courseTitle}{resumeTarget.lessonTitle ? ` · ${resumeTarget.lessonTitle}` : ''}
                  </span>
                </span>
                <span className="tc-resume-arrow">→</span>
              </button>
            </>
          )}
          {/* Search lives in the tab row now (see the segmented tabs above). */}
          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
              <div style={{ textAlign: 'center' }}>
                <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
                <div style={{ color: 'var(--text-muted)' }}>Loading courses...</div>
              </div>
            </div>
          ) : filteredCourses.length > 0 ? (
            <div>
              {groupCoursesByCategory(filteredCourses).map((section) => (
              <div key={section.category} className="training-category-section">
                {section.category !== UNCATEGORIZED_LABEL && <div className="training-category-heading">{section.category}</div>}
                <div className="training-card-grid" data-tour="course-grid">
              {section.courses.map((course: Course) => {
                const progress = courseProgress[course.id] || { completed: 0, total: 0, isCompleted: false };
                return (
                  <button
                    key={course.id}
                    type="button"
                    className="training-card"
                    onClick={() => {
                      const published = (course.pages ?? []).filter(p => p.status === 'published');
                      // If the search matched a specific video/lesson (and not the
                      // course title itself), open the course straight to that lesson.
                      const term = search.trim().toLowerCase();
                      const titleMatch = term !== '' && (course.title || '').toLowerCase().includes(term);
                      const matchedPage = term === '' || titleMatch
                        ? undefined
                        : published.find(p => !p.isQuiz && (p.title || '').toLowerCase().includes(term));
                      enterCourse(course, matchedPage?.id ?? published[0]?.id ?? null);
                    }}
                    style={{ cursor: "pointer", border: "none", background: "none", padding: 0, textAlign: "left" }}
                  >
                    {(() => {
                      const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
                      const statusText = progress.isCompleted ? "Passed" : pct > 0 ? `${pct}% complete` : "Not started";
                      const statusColor = progress.isCompleted ? "#3ea56a" : pct > 0 ? "#e01418" : "var(--text-muted)";
                      return (
                        <>
                        {course.coverImageUrl && (
                          <div
                            className="training-card-image"
                            style={{ backgroundImage: `url(${course.coverImageUrl})` }}
                          />
                        )}
                        <div className="training-card-body">
                          <div className="training-card-top">
                            <div className="training-card-title">{course.title}</div>
                            <div className="training-card-status" style={{ color: statusColor }}>{statusText}</div>
                          </div>
                          {lessonCount(course) > 0 && (
                            <div className="training-card-lessons">
                              {lessonCount(course)} lesson{lessonCount(course) === 1 ? "" : "s"}
                            </div>
                          )}
                          <div className="training-card-progress-track">
                            <div
                              className="training-card-progress-fill"
                              style={{
                                width: `${pct}%`,
                                background: progress.isCompleted
                                  ? "linear-gradient(90deg, #2f8f57, #3ea56a)"
                                  : "linear-gradient(90deg, #b30002, #e01418)",
                              }}
                            />
                          </div>
                        </div>
                        </>
                      );
                    })()}
                  </button>
                );
              })}
                </div>
              </div>
              ))}
            </div>
          ) : (
            <div className="panel-empty">No trainings match your search yet.</div>
          )}
        </>
      );
    }
    if (activeTab === 'myPlaylists') {
      return (
        <div className="panel">
          <div className="panel-header">
            <span style={{ fontFamily: '"Arial Narrow","Roboto Condensed","Helvetica Neue",Arial,sans-serif', fontSize: 21, fontWeight: 800, letterSpacing: 0.2, textTransform: 'uppercase', color: 'var(--text-primary)' }}>My Playlists</span>
          </div>
          <div className="panel-body">
            {playlists.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }}>📋</div>
                <h3 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '8px' }}>
                  No Playlists Yet
                </h3>
                <p>Create a playlist by clicking "Make Playlist" when viewing a course</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 16 }} className="playlist-grid">
                {playlists.map((playlist) => (
                  <div key={playlist.id} className="card playlist-card" style={{ padding: 16, height: 'auto', borderLeft: '4px solid #e01418' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }} className="playlist-card-content">
                      <div style={{ flex: 1 }} className="playlist-card-info">
                        <div style={{ fontFamily: '"Arial Narrow","Roboto Condensed","Helvetica Neue",Arial,sans-serif', fontSize: 19, fontWeight: 800, letterSpacing: 0.2, textTransform: 'uppercase', marginBottom: 8, color: 'var(--text-primary)' }} className="playlist-card-title">
                          {playlist.name}
                        </div>
                        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 8 }}>
                          Course: {playlist.courseName}
                        </div>
                        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                          {playlist.selectedModules.length} module{playlist.selectedModules.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 12 }} className="playlist-card-actions">
                        <button
                          type="button"
                          className="btn-primary playlist-action-btn"
                          style={{ background: 'linear-gradient(90deg,#b30002,#e01418)', color: '#fff', border: 'none', boxShadow: '0 3px 10px rgba(202,0,2,0.3)' }}
                          onClick={() => {
                            const course = courses.find(c => c.id === playlist.courseId);
                            if (course) {
                              const playlistPages = (course.pages ?? [])
                                .filter(p => p.status === 'published' && playlist.selectedModules.includes(p.id))
                                .sort((a, b) => playlist.selectedModules.indexOf(a.id) - playlist.selectedModules.indexOf(b.id));
                              enterCourse(course, playlistPages[0]?.id ?? null, {
                                ...playlist,
                                id: playlist._id || playlist.id,
                              });
                            }
                          }}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-danger playlist-action-btn"
                          onClick={async () => {
                            if (await appConfirm('Delete this playlist?')) {
                              try {
                                const response = await fetch(`/api/playlists?id=${playlist._id || playlist.id}`, {
                                  method: 'DELETE',
                                });
                                
                                if (response.ok) {
                                  const updated = playlists.filter(p => 
                                    (p.id !== playlist.id && p._id !== playlist._id)
                                  );
                                  setPlaylists(updated);
                                  alert('Playlist deleted successfully!');
                                } else {
                                  alert('Failed to delete playlist');
                                }
                              } catch (error) {
                                console.error('Error deleting playlist:', error);
                                alert('Failed to delete playlist');
                              }
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }
    if (activeTab === 'assignedPlaylists') {
      return (
        <div className="panel">
          <div className="panel-header">
            <span>Assigned Playlists</span>
          </div>
          <div className="panel-body">
            {assignedPlaylists.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }}>📋</div>
                <h3 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '8px' }}>
                  No Assigned Playlists
                </h3>
                <p>Your Sales Team Lead hasn't assigned any playlists yet</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 16 }} className="playlist-grid">
                {assignedPlaylists.map((assignment) => (
                  <div key={assignment._id} className="card playlist-card" style={{ padding: 16, height: 'auto', borderLeft: '4px solid #e01418' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }} className="playlist-card-content">
                      <div style={{ flex: 1 }} className="playlist-card-info">
                        <div style={{ fontFamily: '"Arial Narrow","Roboto Condensed","Helvetica Neue",Arial,sans-serif', fontSize: 19, fontWeight: 800, letterSpacing: 0.2, textTransform: 'uppercase', marginBottom: 8, color: 'var(--text-primary)' }} className="playlist-card-title">
                          {assignment.playlistName}
                        </div>
                        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 4 }}>
                          Course: {assignment.courseName}
                        </div>
                        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 4 }}>
                          {assignment.selectedModules.length} module{assignment.selectedModules.length !== 1 ? 's' : ''}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-subtle)', fontStyle: 'italic' }}>
                          Assigned by: {assignment.managerName}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 12 }} className="playlist-card-actions">
                        <button
                          type="button"
                          className="btn-primary playlist-action-btn"
                          style={{ background: 'linear-gradient(90deg,#b30002,#e01418)', color: '#fff', border: 'none', boxShadow: '0 3px 10px rgba(202,0,2,0.3)' }}
                          onClick={() => {
                            const course = courses.find(c => c.id === assignment.courseId);
                            if (course) {
                              const playlist = {
                                id: assignment.playlistId,
                                name: assignment.playlistName,
                                courseId: assignment.courseId,
                                courseName: assignment.courseName,
                                selectedModules: assignment.selectedModules,
                                createdAt: assignment.createdAt
                              };
                              const playlistPages = (course.pages ?? [])
                                .filter(p => p.status === 'published' && assignment.selectedModules.includes(p.id))
                                .sort((a, b) => assignment.selectedModules.indexOf(a.id) - assignment.selectedModules.indexOf(b.id));
                              enterCourse(course, playlistPages[0]?.id ?? null, playlist);
                            }
                          }}
                        >
                          View
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    return null;
  }
  function CourseView() {
    if (!selectedCourse) return null;
    
    let pages = (selectedCourse.pages ?? []).filter(p => p.status === 'published');
    if (viewingPlaylist) {
      pages = pages.filter(p => viewingPlaylist.selectedModules.includes(p.id));
    }
    let folders = selectedCourse.folders ?? [];
    if (viewingPlaylist) {
      const selectedPageIds = new Set(viewingPlaylist.selectedModules);
      folders = folders.filter(folder =>
        pages.some(page => page.folderId === folder.id && selectedPageIds.has(page.id))
      );
    }
    // Reorder navigation/unlock pages to match the folder-grouped sidebar display.
    pages = orderPagesByFolder(pages, folders);
    const activePage = pages.find((p) => p.id === activePageId) ?? pages[0];
    const isPageUnlocked = (pageId: string) => {
      // "Unlock all" on the course opens every lesson & quiz for everyone.
      if (selectedCourse?.unlockAll) return true;
      // A manager can manually unlock this specific page — it then opens without
      // the preceding items done (only THIS page, nothing after it, is unlocked).
      if (unlockedPages.has(pageId)) return true;
      // Once completed, a lesson/quiz NEVER re-locks.
      const self = pages.find(p => p.id === pageId);
      if (self && (self.isQuiz
        ? isQuizResultPassing(savedQuizResults.find(r => r.pageId === pageId))
        : completedPages.has(pageId))) return true;
      const currentIndex = pages.findIndex(p => p.id === pageId);
      if (currentIndex <= 0) return true;
      // Strict sequential: EVERY preceding item must be complete (lesson watched
      // or quiz passed). The first incomplete item locks everything after it — so
      // a newly-inserted lesson/quiz re-locks the rest until it's done.
      for (let i = 0; i < currentIndex; i++) {
        const prev = pages[i];
        if (prev.isQuiz) {
          if (!isQuizResultPassing(savedQuizResults.find(r => r.pageId === prev.id))) return false;
        } else if (!completedPages.has(prev.id)) {
          return false;
        }
      }
      return true;
    };
    const progress = courseProgress[selectedCourse.id] || { completed: 0, total: 0, isCompleted: false };
    const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
    const totalLessons = (selectedCourse.pages ?? []).filter(p => p.status === 'published').length;
    const totalSections = (selectedCourse.folders ?? []).length;

    // Mobile overview screen — shown before any lesson is selected
    const MobileOverview = () => (
      <div className="mobile-course-overview">
        {/* Course title + ⋯ menu */}
        <div style={{ padding: '16px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{selectedCourse.title}</div>
          <div style={{ position: 'relative' }}>
            <button type="button" onClick={() => setShowCourseMenu(p => !p)} style={{ background: 'none', border: 'none', padding: '2px 6px', fontSize: 22, cursor: 'pointer', color: 'var(--text-tertiary)', letterSpacing: 1 }}>⋯</button>
            {showCourseMenu && (
              <div style={{ position: 'absolute', top: '110%', right: 0, background: 'var(--surface-default)', border: '1px solid var(--border-default)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 200, minWidth: 170, padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {!viewingPlaylist && (
                  <button type="button" className="btn-primary btn-small" style={{ width: '100%', textAlign: 'left', backgroundColor: 'var(--surface-inverse)', color: 'var(--text-inverse)', border: 'none', fontSize: '14px', fontWeight: 700 }} onClick={() => { setIsCreatePlaylistOpen(true); setShowCourseMenu(false); }}>Make Playlist</button>
                )}
                <button type="button" className="btn-secondary btn-small" style={{ width: '100%', textAlign: 'left', backgroundColor: 'var(--surface-inverse)', color: 'var(--text-inverse)', border: 'none', fontSize: '14px', fontWeight: 700 }} onClick={() => { setSelectedCourse(null); setActivePageId(null); setViewingPlaylist(null); setCourseViewInitialized(null); setShowCourseMenu(false); }}>Back to Courses</button>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 4px' }}>
                  <div onClick={() => { const next = !autoPlay; setAutoPlay(next); localStorage.setItem('sales-autoplay', String(next)); }} style={{ width: 36, height: 20, borderRadius: 10, backgroundColor: autoPlay ? '#e01418' : 'var(--border-default)', position: 'relative', transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: 2, left: autoPlay ? 18 : 2, width: 16, height: 16, borderRadius: '50%', backgroundColor: 'var(--surface-default)', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Autoplay</span>
                </label>
              </div>
            )}
          </div>
        </div>
        {/* Progress */}
        <div style={{ padding: '12px 16px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 8 }}>Course Progress</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Completed {progress.completed} of {progress.total} lessons</div>
          <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-muted)', overflow: 'hidden', marginBottom: 4 }}>
            <div style={{ height: '100%', borderRadius: 999, background: progress.isCompleted ? '#10b981' : '#e01418', width: `${pct}%`, transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>{pct}%</div>
        </div>
        {/* Continue button */}
        <div style={{ padding: '16px 16px 0' }}>
          <button
            type="button"
            onClick={() => {
              // Find the first page that isn't completed
              const firstIncomplete = pages.find(p => {
                if (p.isQuiz) return !isQuizResultPassing(savedQuizResults.find(r => r.pageId === p.id));
                return !completedPages.has(p.id);
              });
              const targetPage = firstIncomplete || pages[pages.length - 1] || pages[0];
              if (targetPage && isPageUnlocked(targetPage.id)) {
                setActivePageId(targetPage.id);
                setMobileCourseScreen('lesson');
              } else if (pages[0]) {
                setActivePageId(pages[0].id);
                setMobileCourseScreen('lesson');
              }
            }}
            style={{ width: '100%', padding: '14px', borderRadius: 999, border: 'none', background: 'var(--surface-inverse)', color: 'var(--text-inverse)', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
          >
            Continue course
          </button>
        </div>
        {/* Course Content */}
        <div style={{ padding: '24px 16px 8px' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>Course Content</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            {totalSections > 0 ? `${totalSections} Sections • ` : ''}{totalLessons} Lessons
          </div>
        </div>
        {/* Lesson list */}
        <div style={{ borderTop: '1px solid var(--border-default)' }}>
          {pages.filter(p => !p.folderId).map(page => {
            const unlocked = isPageUnlocked(page.id);
            return (
              <div
                key={page.id}
                onClick={() => { 
                  if (unlocked) {
                    setActivePageId(page.id); 
                    setMobileCourseScreen('lesson'); 
                  }
                }}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  padding: '14px 16px', 
                  borderBottom: '1px solid #f1f5f9', 
                  cursor: unlocked ? 'pointer' : 'not-allowed', 
                  background: activePageId === page.id ? '#fef3c7' : 'var(--surface-default)',
                  opacity: unlocked ? 1 : 0.6
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <LessonTick page={page} completedPages={completedPages} quizResults={savedQuizResults} />
                  <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                    {!unlocked && "🔒 "}{page.title}
                  </span>
                </div>
              </div>
            );
          })}
          {folders.map(folder => {
            const folderPages = pages.filter(p => p.folderId === folder.id);
            const isCollapsed = collapsedFolders.has(folder.id);
            return (
              <div key={folder.id}>
                <div
                  onClick={() => {
                    const next = new Set(collapsedFolders);
                    if (isCollapsed) next.delete(folder.id); else next.add(folder.id);
                    setCollapsedFolders(next);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'var(--surface-subtle)', borderBottom: '1px solid var(--border-default)', cursor: 'pointer' }}
                >
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{isCollapsed ? '∧' : '∨'}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-tertiary)' }}>{folder.title}</span>
                </div>
                {!isCollapsed && folderPages.map(page => {
                  const unlocked = isPageUnlocked(page.id);
                  return (
                    <div
                      key={page.id}
                      onClick={() => { 
                        if (unlocked) {
                          setActivePageId(page.id); 
                          setMobileCourseScreen('lesson'); 
                        }
                      }}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        padding: '14px 16px 14px 32px', 
                        borderBottom: '1px solid #f1f5f9', 
                        cursor: unlocked ? 'pointer' : 'not-allowed', 
                        background: activePageId === page.id ? '#fef3c7' : 'var(--surface-default)',
                        opacity: unlocked ? 1 : 0.6
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <LessonTick page={page} completedPages={completedPages} quizResults={savedQuizResults} />
                        <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                          {!unlocked && "🔒 "}{page.title}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );

    const handleNextPage = () => {
      if (!activePage || !user || !selectedCourse) return;
      const currentIndex = pages.findIndex(p => p.id === activePage.id);

      // Only mark lesson pages as completed (not quizzes)
      let newCompleted = completedPages;
      if (!activePage.isQuiz) {
        newCompleted = new Set([...completedPages, activePage.id]);
        setCompletedPages(newCompleted);

        // Update the card progress state immediately
        setCourseProgress(prev => ({
          ...prev,
          [selectedCourse.id]: computeItemProgress(pages, newCompleted, savedQuizResults, prev[selectedCourse.id]?.isCompleted),
        }));

        fetch('/api/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, courseId: selectedCourse.id, completedPages: Array.from(newCompleted) })
        }).catch(err => console.error("Failed to save progress:", err));
      }

      if (currentIndex < pages.length - 1) {
        setActivePageId(pages[currentIndex + 1].id);
        setTimeout(() => {
          document.querySelector('.course-page-main')?.scrollTo({ top: 0, behavior: 'smooth' });
        }, 100);
      }
    };

    // The SERVER grades the attempt: we send the answers and it returns the
    // score, the verdict and a per-question review (spec 2026-07-26). The
    // answer key is no longer in the page payload, so nothing is graded here.
    const handleSubmitQuiz = async () => {
      if (!activePage?.quizQuestions || !user || !selectedCourse || quizSubmitting) return;
      setQuizSubmitting(true);
      setQuizError(null);
      try {
        const result = await submitQuizAttempt({
          courseId: selectedCourse.id,
          pageId: activePage.id,
          answers: selectedAnswers,
        });
        const pct = Math.round(result.pct * 100);
        setQuizScore(result.score);
        setQuizReview(reviewToCorrectnessMap(result.review));
        setQuizSubmitted(true);

        if (result.passed) {
          // The server already stored the pass; mirror it locally so the lesson
          // tick turns green without refetching the course.
          const newResult = { pageId: activePage.id, answers: selectedAnswers, score: result.score, passed: true, submittedAt: new Date() };
          setSavedQuizResults(prev => [...prev.filter(r => r.pageId !== activePage.id), newResult]);
          setQuizAttempts(prev => ({ ...prev, [activePage.id]: 0 }));
          const currentIndex = pages.findIndex(p => p.id === activePage.id);
          if (currentIndex < pages.length - 1) {
            setTimeout(() => { handleNextPage(); }, 1500);
          }
          return;
        }

        // Failed: do NOT advance. Show top-up.
        const attempts = (quizAttempts[activePage.id] || 0) + 1;
        setQuizAttempts(prev => ({ ...prev, [activePage.id]: attempts }));
        if (attempts >= QUIZ_MAX_ATTEMPTS) {
          // Second fail -> send back to the lesson immediately before this quiz.
          const idx = pages.findIndex(p => p.id === activePage.id);
          let prevLessonId: string | null = null;
          for (let i = idx - 1; i >= 0; i--) { if (!pages[i].isQuiz) { prevLessonId = pages[i].id; break; } }
          setQuizModal({ mode: 'relearn', pageId: activePage.id, pct, prevLessonId });
          setQuizAttempts(prev => ({ ...prev, [activePage.id]: 0 }));
        } else {
          setQuizModal({ mode: 'retry', pageId: activePage.id, pct, prevLessonId: null });
        }
      } catch (e) {
        console.error(e);
        setQuizError("Couldn't submit your quiz. Try again.");
      } finally {
        setQuizSubmitting(false);
      }
    };

    // Retry the same quiz: reset answers and reshuffle the question order.
    const handleQuizRetry = (pageId: string) => {
      setQuizModal(null);
      setQuizSubmitted(false);
      setQuizScore(null);
      setQuizReview({});
      setQuizError(null);
      setQuizFailAction(null);
      setSelectedAnswers({});
      const page = pages.find(p => p.id === pageId);
      if (page?.quizQuestions?.length) {
        setQuizQuestionOrder(prev => ({ ...prev, [pageId]: selectQuizQuestions(page.quizQuestions!, page.questionsToShow) }));
      }
    };

    // Send the user back to the preceding lesson to relearn it.
    const handleQuizRelearn = (prevLessonId: string | null) => {
      setQuizModal(null);
      setQuizSubmitted(false);
      setQuizScore(null);
      setQuizReview({});
      setQuizError(null);
      setQuizFailAction(null);
      setSelectedAnswers({});
      if (prevLessonId) {
        setActivePageId(prevLessonId);
        setTimeout(() => {
          document.querySelector('.course-page-main')?.scrollTo({ top: 0, behavior: 'smooth' });
        }, 100);
      }
    };
    const handleCompleteCourse = () => {
      if (!user || !selectedCourse) return;
      setCourseCompleted(true);

      let newCompleted = completedPages;
      if (activePage && !activePage.isQuiz) {
        newCompleted = new Set([...completedPages, activePage.id]);
        setCompletedPages(newCompleted);
      }

      // Mark course complete (counts all published items — lessons + quizzes).
      setCourseProgress(prev => ({
        ...prev,
        [selectedCourse.id]: computeItemProgress(pages, newCompleted, savedQuizResults, true),
      }));

      fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          courseId: selectedCourse.id,
          completedPages: Array.from(newCompleted),
          courseCompleted: true
        })
      }).catch(err => console.error("Failed to complete course:", err));
    };

    return (
      <>
        <style>{`
          .training-center [data-video-share],
          .training-center [data-video-delete],
          .training-center [data-image-delete] {
            display: none !important;
          }
          @media (max-width: 767px) {
            .mobile-course-overview { display: block; }
            .mobile-lesson-view { display: block; }
            .desktop-course-view { display: none !important; }
            .course-header-desktop-actions { display: flex !important; flex-wrap: wrap; gap: 6px; }
            .course-header-mobile-actions { display: none !important; }
            .training-center-header { flex-direction: column !important; align-items: flex-start !important; gap: 10px !important; }
          }
          @media (min-width: 768px) {
            .mobile-course-overview { display: none !important; }
            .mobile-lesson-view { display: none !important; }
            .desktop-course-view { display: contents; }
            .course-header-desktop-actions { display: flex !important; }
            .course-header-mobile-actions { display: none !important; }
          }
        `}</style>
        {/* Quiz top-up modal — shown when a quiz is failed (< 80%) */}
        {quizModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
            <div style={{ background: 'var(--surface-default)', borderRadius: 14, maxWidth: 440, width: '100%', padding: '28px 26px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ fontSize: 44, marginBottom: 8 }}>{quizModal.mode === 'retry' ? '📊' : '📚'}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#16202b', marginBottom: 10 }}>
                {quizModal.mode === 'retry' ? 'Top up your score!' : "Let's revisit the lesson"}
              </div>
              <div style={{ fontSize: 14, color: '#5b6670', lineHeight: 1.55, marginBottom: 22 }}>
                {quizModal.mode === 'retry'
                  ? <>You scored <b>{quizModal.pct}%</b>. You need <b>{Math.round(QUIZ_PASS_THRESHOLD * 100)}%</b> to move on. Give it another try: score above {Math.round(QUIZ_PASS_THRESHOLD * 100)}% and you'll advance to the next step.</>
                  : <>You scored <b>{quizModal.pct}%</b> again. Your performance isn't there yet, so please go through the lesson once more, then retake the quiz.</>}
              </div>
              {quizModal.mode === 'retry' ? (
                <button type="button" className="btn-primary" style={{ width: '100%' }} onClick={() => handleQuizRetry(quizModal.pageId)}>Try Again</button>
              ) : (
                <button type="button" className="btn-primary" style={{ width: '100%' }} onClick={() => handleQuizRelearn(quizModal.prevLessonId)}>Review Lesson</button>
              )}
              {/* Dismissing to read the answers must not be a dead end: the
                  pending action is kept and re-offered on the review screen. */}
              <button
                type="button"
                onClick={() => { setQuizFailAction({ mode: quizModal.mode, pageId: quizModal.pageId, prevLessonId: quizModal.prevLessonId }); setQuizModal(null); }}
                style={{ width: '100%', marginTop: 10, background: 'none', border: 'none', color: '#5b6670', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
              >
                See which answers I got wrong
              </button>
            </div>
          </div>
        )}

        {/* MOBILE: Overview screen */}
        {mobileCourseScreen === 'overview' && MobileOverview()}

        {/* MOBILE: Lesson screen - full page, no sidebar */}
        {mobileCourseScreen === 'lesson' && activePage && (
          <div className="mobile-lesson-fullpage">
            <button
              type="button"
              onClick={() => setMobileCourseScreen('overview')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '12px 16px', fontSize: 14, color: 'var(--text-tertiary)', fontWeight: 500 }}
            >
              ← Course Content
            </button>
            <div className="course-page-main">
              <div className="course-page-main-header" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <LessonTick page={activePage} completedPages={completedPages} quizResults={savedQuizResults} size={22} />
                <h2 className="course-page-title-input" style={{ border: 'none', background: 'none', padding: 0 }}>{activePage.title}</h2>
              </div>
              {activePage.isQuiz && activePage.quizQuestions && activePage.quizQuestions.length > 0 ? (
                <div className="course-page-editor-body">
                  {quizSubmitted && quizScore && (
                    <div style={{ padding: '16px', marginBottom: '16px', backgroundColor: quizScore.correct === quizScore.total ? '#d1fae5' : '#fef3c7', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>Score: {quizScore.correct}/{quizScore.total}</div>
                      <div style={{ fontSize: '14px', color: '#666' }}>{quizScore.correct === quizScore.total ? 'Perfect! 🎉' : `You got ${Math.round((quizScore.correct / quizScore.total) * 100)}%`}</div>
                    </div>
                  )}
                  <div style={{ padding: '12px' }}>
                    {(quizQuestionOrder[activePage.id] || activePage.quizQuestions).map((q, qIdx) => (
                      <div key={q.id} style={{ marginBottom: 32 }}>
                        <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: 16 }}>Question {qIdx + 1}: {q.prompt}</div>
                        {q.options.map((option: string, optIdx: number) => {
                          const isSelected = selectedAnswers[q.id] === optIdx;
                          // Only the rep's OWN answer is ever marked. A question
                          // they got wrong is marked wrong and the right option
                          // stays unmarked: the client is not told the answer.
                          const showCorrect = quizSubmitted && isSelected && quizReview[q.id] === true;
                          const showWrong = quizSubmitted && isSelected && quizReview[q.id] === false;
                          return (
                            <div key={optIdx} onClick={() => !quizSubmitted && setSelectedAnswers({ ...selectedAnswers, [q.id]: optIdx })}
                              style={{ padding: '12px 16px', marginBottom: 12, border: '2px solid', borderColor: quizSubmitted ? (showCorrect ? '#10b981' : showWrong ? '#ef4444' : 'var(--border-default)') : (isSelected ? '#e01418' : 'var(--border-default)'), borderRadius: 8, cursor: quizSubmitted ? 'default' : 'pointer', backgroundColor: quizSubmitted ? (showCorrect ? '#d1fae5' : showWrong ? '#fee2e2' : 'var(--surface-default)') : (isSelected ? 'rgba(202,0,2,0.08)' : 'var(--surface-default)') }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid', borderColor: quizSubmitted ? (showCorrect ? '#10b981' : showWrong ? '#ef4444' : 'var(--border-default)') : (isSelected ? '#e01418' : 'var(--border-default)'), backgroundColor: isSelected ? (quizSubmitted ? (showCorrect ? '#10b981' : '#ef4444') : '#e01418') : 'var(--surface-default)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {isSelected && <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--surface-default)' }} />}
                                </div>
                                <span style={{ fontSize: 14 }}>{option}</span>
                                {showCorrect && <span style={{ marginLeft: 'auto', color: '#10b981', fontWeight: 700 }}>✓ Correct</span>}
                                {showWrong && <span style={{ marginLeft: 'auto', color: '#ef4444', fontWeight: 700 }}>✗ Incorrect</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="course-page-editor-body" data-tour="video-area">
                  <div className="course-page-body-input"
                    dangerouslySetInnerHTML={{ __html: (activePage.body || '').replace(/(<iframe[^>]*vimeo[^>]*)loading="lazy"/gi, '$1') }}
                    style={{ padding: '12px', border: '1px solid #ddd', borderRadius: '4px', whiteSpace: 'pre-wrap', minHeight: 'auto', maxHeight: 'none', overflow: 'visible' }}
                  />
                </div>
              )}
            </div>
            <div className="mobile-lesson-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {progress.isCompleted && (
                  <div style={{ fontSize: 14, color: '#10b981', fontWeight: 600 }}>✓ Course Completed!</div>
                )}
              </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {activePage.isQuiz && !quizSubmitted && (
                    <button type="button" className="btn-primary" onClick={handleSubmitQuiz} disabled={Object.keys(selectedAnswers).length !== ((quizQuestionOrder[activePage.id] || activePage.quizQuestions)?.length || 0) || quizSubmitting}>Submit Quiz</button>
                  )}
                  {activePage.isQuiz && quizSubmitted && quizFailAction && (
                    quizFailAction.mode === 'retry'
                      ? <button type="button" className="btn-primary" onClick={() => handleQuizRetry(quizFailAction.pageId)}>Try Again</button>
                      : <button type="button" className="btn-primary" onClick={() => handleQuizRelearn(quizFailAction.prevLessonId)}>Review Lesson</button>
                  )}
                  {activePage.isQuiz && !quizSubmitted && quizError && (
                    <div style={{ alignSelf: 'center', fontSize: 12, color: '#dc2626', fontWeight: 600 }}>{quizError}</div>
                  )}
                  {pages.findIndex(p => p.id === activePage.id) === pages.length - 1 && (!activePage.isQuiz || quizSubmitted) && !progress.isCompleted && (
                     <button 
                       type="button" 
                       className="btn-primary" 
                       onClick={handleCompleteCourse} 
                       style={{ backgroundColor: '#10b981', opacity: (!activePage.isQuiz && !completedPages.has(activePage.id)) ? 0.5 : 1, cursor: (!activePage.isQuiz && !completedPages.has(activePage.id)) ? 'not-allowed' : 'pointer' }}
                       disabled={!activePage.isQuiz && !completedPages.has(activePage.id)}
                     >
                       ✓ Complete Course
                     </button>
                   )}
                   {(!activePage.isQuiz || quizSubmitted) && pages.findIndex(p => p.id === activePage.id) < pages.length - 1 && (
                     <button 
                       type="button" 
                       className="btn-primary" 
                       onClick={() => { handleNextPage(); }}
                       style={{ opacity: (!activePage.isQuiz && !completedPages.has(activePage.id)) ? 0.5 : 1, cursor: (!activePage.isQuiz && !completedPages.has(activePage.id)) ? 'not-allowed' : 'pointer' }}
                       disabled={!activePage.isQuiz && !completedPages.has(activePage.id)}
                     >
                       Next Page →
                     </button>
                   )}
                </div>
            </div>
          </div>
        )}

        {/* DESKTOP: full layout - hidden on mobile via CSS */}
        <div className="desktop-course-view">
        <div className="training-center-header" style={{ marginTop: -14 }}>
          <div className="panel-header" style={{ fontFamily: '"Arial Narrow","Roboto Condensed","Helvetica Neue",Arial,sans-serif', fontSize: 21, fontWeight: 800, letterSpacing: 0.2, color: 'var(--text-primary)' }}>{selectedCourse.title}</div>
          {/* Desktop: show all buttons inline */}
          <div className="course-header-desktop-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!viewingPlaylist && (
              <button type="button" className="btn-primary btn-small" style={{ background: 'linear-gradient(90deg,#b30002,#e01418)', color: '#fff', border: 'none', fontSize: '14px', fontWeight: 700, boxShadow: '0 3px 10px rgba(202,0,2,0.3)' }} onClick={() => setIsCreatePlaylistOpen(true)}>Make Playlist</button>
            )}
            <button type="button" className="btn-secondary btn-small" style={{ background: 'var(--surface-subtle)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', fontSize: '14px', fontWeight: 700 }} onClick={() => { setSelectedCourse(null); setActivePageId(null); setViewingPlaylist(null); setCourseViewInitialized(null); }}>← Back to Courses</button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
              <div onClick={() => { const next = !autoPlay; setAutoPlay(next); localStorage.setItem('sales-autoplay', String(next)); }} style={{ width: 40, height: 22, borderRadius: 11, backgroundColor: autoPlay ? '#e01418' : 'var(--border-default)', position: 'relative', transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 3, left: autoPlay ? 21 : 3, width: 16, height: 16, borderRadius: '50%', backgroundColor: 'var(--surface-default)', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </div>
              <span style={{ fontSize: 13, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>Autoplay</span>
            </label>
          </div>
          {/* Mobile/Tablet: ⋯ menu inline with title */}
          <div className="course-header-mobile-actions" style={{ position: 'relative', display: 'none', alignItems: 'center' }}>
            <button type="button" onClick={() => setShowCourseMenu(p => !p)} style={{ background: 'none', border: 'none', padding: '2px 6px', fontSize: 22, cursor: 'pointer', lineHeight: 1, color: 'var(--text-tertiary)', letterSpacing: 1 }}>⋯</button>
            {showCourseMenu && (
              <div style={{ position: 'absolute', top: '110%', right: 0, background: 'var(--surface-default)', border: '1px solid var(--border-default)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 200, minWidth: 170, padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {!viewingPlaylist && (
                  <button type="button" className="btn-primary btn-small" style={{ width: '100%', textAlign: 'left', backgroundColor: 'var(--surface-inverse)', color: 'var(--text-inverse)', border: 'none', fontSize: '14px', fontWeight: 700 }} onClick={() => { setIsCreatePlaylistOpen(true); setShowCourseMenu(false); }}>Make Playlist</button>
                )}
                <button type="button" className="btn-secondary btn-small" style={{ width: '100%', textAlign: 'left', backgroundColor: 'var(--surface-inverse)', color: 'var(--text-inverse)', border: 'none', fontSize: '14px', fontWeight: 700 }} onClick={() => { setSelectedCourse(null); setActivePageId(null); setViewingPlaylist(null); setCourseViewInitialized(null); setShowCourseMenu(false); }}>Back to Courses</button>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 4px' }}>
                  <div onClick={() => { const next = !autoPlay; setAutoPlay(next); localStorage.setItem('sales-autoplay', String(next)); }} style={{ width: 36, height: 20, borderRadius: 10, backgroundColor: autoPlay ? '#e01418' : 'var(--border-default)', position: 'relative', transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: 2, left: autoPlay ? 18 : 2, width: 16, height: 16, borderRadius: '50%', backgroundColor: 'var(--surface-default)', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Autoplay</span>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Playlist Creation Modal */}
        {isCreatePlaylistOpen && (
          <div className="overlay">
            <div className="dialog" style={{ width: 'min(700px, 92vw)', maxWidth: 700, maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border-default)' }}>
              <div className="dialog-title" style={{ fontFamily: '"Arial Narrow","Roboto Condensed","Helvetica Neue",Arial,sans-serif', fontSize: 24, fontWeight: 800, letterSpacing: 0.3, textTransform: 'uppercase', color: 'var(--text-primary)', marginBottom: 6, paddingBottom: 10, borderBottom: '2px solid #e01418' }}>Create Playlist</div>
              <div style={{ padding: '16px 0' }}>
                <label className="field" style={{ marginBottom: 16 }}>
                  <span className="field-label">Playlist Name</span>
                  <input
                    className="field-input"
                    value={playlistName}
                    onChange={(e) => setPlaylistName(e.target.value)}
                    placeholder="Enter playlist name"
                  />
                </label>
                <div className="field">
                  <span className="field-label">Select Lessons & Quizzes</span>
                  <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid var(--border-default)', borderRadius: 8, padding: 12 }}>
                    {/* Pages without folders */}
                    {pages.filter(p => !p.folderId).map((page) => (
                      <label key={page.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 0', cursor: 'pointer', marginLeft: 0 }}>
                        <input
                          type="checkbox"
                          checked={selectedModules.has(page.id)}
                          onChange={(e) => {
                            const newSet = new Set(selectedModules);
                            if (e.target.checked) {
                              newSet.add(page.id);
                            } else {
                              newSet.delete(page.id);
                            }
                            setSelectedModules(newSet);
                          }}
                          style={{ marginRight: 8 }}
                        />
                        <span>{page.title}</span>
                      </label>
                    ))}
                    
                    {/* Folders with their pages */}
                    {folders.map((folder) => {
                      const folderPages = pages.filter(p => p.folderId === folder.id);
                      if (folderPages.length === 0) return null;
                      
                      const allFolderPagesSelected = folderPages.every(p => selectedModules.has(p.id));
                      const someFolderPagesSelected = folderPages.some(p => selectedModules.has(p.id));
                      
                      return (
                        <div key={folder.id} style={{ marginTop: 12 }}>
                          <label style={{ display: 'flex', alignItems: 'center', padding: '8px 0', cursor: 'pointer', fontWeight: 600, backgroundColor: 'var(--surface-subtle)', paddingLeft: 8, borderRadius: 4 }}>
                            <input
                              type="checkbox"
                              checked={allFolderPagesSelected}
                              ref={(el) => {
                                if (el) el.indeterminate = someFolderPagesSelected && !allFolderPagesSelected;
                              }}
                              onChange={(e) => {
                                const newSet = new Set(selectedModules);
                                if (e.target.checked) {
                                  // Select all pages in this folder
                                  folderPages.forEach(p => newSet.add(p.id));
                                } else {
                                  // Deselect all pages in this folder
                                  folderPages.forEach(p => newSet.delete(p.id));
                                }
                                setSelectedModules(newSet);
                              }}
                              style={{ marginRight: 8 }}
                            />
                            <span>📁 {folder.title}</span>
                          </label>
                          <div style={{ marginLeft: 24 }}>
                            {folderPages.map((page) => (
                              <label key={page.id} style={{ display: 'flex', alignItems: 'center', padding: '6px 0', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={selectedModules.has(page.id)}
                                  onChange={(e) => {
                                    const newSet = new Set(selectedModules);
                                    if (e.target.checked) {
                                      newSet.add(page.id);
                                    } else {
                                      newSet.delete(page.id);
                                    }
                                    setSelectedModules(newSet);
                                  }}
                                  style={{ marginRight: 8 }}
                                />
                                <span style={{ fontSize: 14 }}>{page.isQuiz ? '📝' : '📄'} {page.title}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="dialog-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setIsCreatePlaylistOpen(false);
                    setPlaylistName('');
                    setSelectedModules(new Set());
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary btn-success"
                  onClick={async () => {
                    if (playlistName.trim() && selectedModules.size > 0 && user) {
                      try {
                        const response = await fetch('/api/playlists', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            name: playlistName,
                            courseId: selectedCourse.id,
                            courseName: selectedCourse.title,
                            selectedModules: Array.from(selectedModules),
                            managerId: user.id,
                            managerName: user.name,
                          }),
                        });
                        
                        if (response.ok) {
                          const newPlaylist = await response.json();
                          const formattedPlaylist = {
                            ...newPlaylist,
                            id: newPlaylist._id || newPlaylist.id,
                          };
                          setPlaylists([...playlists, formattedPlaylist]);
                          setIsCreatePlaylistOpen(false);
                          setPlaylistName('');
                          setSelectedModules(new Set());
                          alert('Playlist created successfully!');
                        } else {
                          alert('Failed to create playlist');
                        }
                      } catch (error) {
                        console.error('Error creating playlist:', error);
                        alert('Failed to create playlist');
                      }
                    }
                  }}
                  disabled={!playlistName.trim() || selectedModules.size === 0}
                >
                  Create Playlist
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="course-pages-layout">
          {/* Mobile Overlay */}
          {isMobileSidebarOpen && (
            <div 
              className="course-modules-mobile-overlay active"
              onClick={() => setIsMobileSidebarOpen(false)}
            />
          )}
          
          <div data-tour="lesson-sidebar" className={`course-pages-left ${isMobileSidebarOpen ? 'mobile-open' : ''}`} style={{ width: `${sidebarWidth}px`, minWidth: '200px', maxWidth: '600px' }}>
            {/* Mobile Header */}
            <div className="course-modules-mobile-header">
              <h3>Course Modules</h3>
            </div>
            
            {/* Expand/Collapse All Buttons */}
            {folders.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', padding: '8px 12px', borderBottom: '1px solid var(--border-default)' }}>
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  onClick={() => setCollapsedFolders(new Set())}
                  style={{ flex: 1, fontSize: '12px', padding: '4px 8px' }}
                >
                  Expand All
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  onClick={() => setCollapsedFolders(new Set(folders.map(f => f.id)))}
                  style={{ flex: 1, fontSize: '12px', padding: '4px 8px' }}
                >
                  Collapse All
                </button>
              </div>
            )}
            <div className="course-pages-sidebar">
              {pages.filter((page) => !page.folderId).map((page) => {
                const unlocked = isPageUnlocked(page.id);
                return (
                  <div
                    key={page.id}
                    className={activePage?.id === page.id ? "course-pages-item active" : "course-pages-item"}
                    onClick={() => {
                      if (unlocked) {
                        setActivePageId(page.id);
                        setIsMobileSidebarOpen(false); // Close sidebar on mobile
                      }
                    }}
                    style={{ cursor: unlocked ? "pointer" : "not-allowed", opacity: unlocked ? 1 : 0.5 }}
                  >
                    <span className="course-pages-item-title" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <LessonTick page={page} completedPages={completedPages} quizResults={savedQuizResults} size={16} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{!unlocked && "🔒 "}{page.title}</span>
                    </span>
                  </div>
                );
              })}
              {folders.map((folder) => {
                const folderPages = pages.filter((p) => p.folderId === folder.id);
                const isCollapsed = collapsedFolders.has(folder.id);
                return (
                  <div key={folder.id} className="course-folder-group">
                    <div className="course-folder-item">
                      <button 
                        type="button" 
                        className="course-folder-toggle"
                        onClick={() => {
                          const next = new Set(collapsedFolders);
                          if (isCollapsed) {
                            next.delete(folder.id);
                          } else {
                            next.add(folder.id);
                          }
                          setCollapsedFolders(next);
                        }}
                      >
                        {isCollapsed ? "▸" : "▾"}
                      </button>
                      <span className="course-folder-title">{folder.title}</span>
                    </div>
                    {!isCollapsed && folderPages.map((page) => {
                      const unlocked = isPageUnlocked(page.id);
                      return (
                        <div
                          key={page.id}
                          className={activePage?.id === page.id ? "course-pages-item course-pages-item-child active" : "course-pages-item course-pages-item-child"}
                          onClick={() => {
                            if (unlocked) {
                              setActivePageId(page.id);
                              setIsMobileSidebarOpen(false); // Close sidebar on mobile
                            }
                          }}
                          style={{ cursor: unlocked ? "pointer" : "not-allowed", opacity: unlocked ? 1 : 0.5 }}
                        >
                          <span className="course-pages-item-title" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <LessonTick page={page} completedPages={completedPages} quizResults={savedQuizResults} size={16} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{!unlocked && "🔒 "}{page.title}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Mobile Toggle Button */}
          <button
            className="course-modules-mobile-toggle"
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            aria-label={isMobileSidebarOpen ? "Close course modules" : "Open course modules"}
          >
            {isMobileSidebarOpen ? '×' : '☰'}
          </button>
          
          {/* Resizer */}
          <div 
            className="course-pages-resizer"
            onMouseDown={(e) => {
              setStartX(e.clientX);
              setStartWidth(sidebarWidth);
              setIsResizing(true);
            }}
            style={{
              width: '4px',
              cursor: 'ew-resize',
              backgroundColor: isResizing ? '#e01418' : 'var(--surface-muted)',
              transition: isResizing ? 'none' : 'background-color 0.2s',
              flexShrink: 0,
              position: 'relative',
              zIndex: 10
            }}
            onMouseEnter={(e) => {
              if (!isResizing) e.currentTarget.style.backgroundColor = '#cbd5e1';
            }}
            onMouseLeave={(e) => {
              if (!isResizing) e.currentTarget.style.backgroundColor = 'var(--surface-muted)';
            }}
          />
          <div className="course-page-main">
            {activePage && (
              <>
                <div className="course-page-main-header" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <LessonTick page={activePage} completedPages={completedPages} quizResults={savedQuizResults} size={22} />
                  <h2 className="course-page-title-input" style={{ border: "none", background: "none", padding: 0 }}>{activePage.title}</h2>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px', marginTop: '-8px' }}>
                  <button
                    type="button"
                    className="btn-primary btn-small"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('Share button clicked! Current state:', isShareModalOpen);
                      setIsShareModalOpen(true);
                      console.log('After setState - should be true');
                    }}
                  >
                    Share
                  </button>
                </div>
                {activePage.isQuiz && activePage.quizQuestions && activePage.quizQuestions.length > 0 ? (
                  <div className="course-page-editor-body">
                    {quizSubmitted && quizScore && (
                      <div style={{ padding: "16px", marginBottom: "16px", backgroundColor: quizScore.correct === quizScore.total ? "#d1fae5" : "#fef3c7", borderRadius: "8px", textAlign: "center" }}>
                        <div style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "8px" }}>
                          Score: {quizScore.correct}/{quizScore.total}
                        </div>
                        <div style={{ fontSize: "14px", color: "#666" }}>
                          {quizScore.correct === quizScore.total ? "Perfect! 🎉" : `You got ${Math.round((quizScore.correct / quizScore.total) * 100)}%`}
                        </div>
                      </div>
                    )}
                    <div style={{ padding: "12px" }}>
                      {(quizQuestionOrder[activePage.id] || activePage.quizQuestions).map((q, qIdx) => (
                        <div key={q.id} style={{ marginBottom: 32 }}>
                          <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: 16 }}>Question {qIdx + 1}: {q.prompt}</div>
                          {q.options.map((option: string, optIdx: number) => {
                            const isSelected = selectedAnswers[q.id] === optIdx;
                            // Only the rep's OWN answer is ever marked. A question they got
                            // wrong is marked wrong and the right option stays unmarked:
                            // the client is never told the answer.
                            const showCorrect = quizSubmitted && isSelected && quizReview[q.id] === true;
                            const showWrong = quizSubmitted && isSelected && quizReview[q.id] === false;
                            const showResult = quizSubmitted;
                            return (
                              <div
                                key={optIdx}
                                onClick={() => !quizSubmitted && setSelectedAnswers({ ...selectedAnswers, [q.id]: optIdx })}
                                style={{
                                  padding: "12px 16px",
                                  marginBottom: 12,
                                  border: "2px solid",
                                  borderColor: showResult ? (showCorrect ? "#10b981" : showWrong ? "#ef4444" : "var(--border-default)") : (isSelected ? "#e01418" : "var(--border-default)"),
                                  borderRadius: 8,
                                  cursor: quizSubmitted ? "default" : "pointer",
                                  backgroundColor: showResult ? (showCorrect ? "#d1fae5" : showWrong ? "#fee2e2" : "var(--surface-default)") : (isSelected ? "rgba(202,0,2,0.08)" : "var(--surface-default)")
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                  <div
                                    style={{
                                      width: 20,
                                      height: 20,
                                      borderRadius: "50%",
                                      border: "2px solid",
                                      borderColor: showResult ? (showCorrect ? "#10b981" : showWrong ? "#ef4444" : "var(--border-default)") : (isSelected ? "#e01418" : "var(--border-default)"),
                                      backgroundColor: isSelected ? (showResult ? (showCorrect ? "#10b981" : "#ef4444") : "#e01418") : "var(--surface-default)",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center"
                                    }}
                                  >
                                    {isSelected && <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "var(--surface-default)" }} />}
                                  </div>
                                  <span style={{ fontSize: 14 }}>{option}</span>
                                  {showCorrect && <span style={{ marginLeft: "auto", color: "#10b981", fontWeight: 700 }}>✓ Correct</span>}
                                  {showWrong && <span style={{ marginLeft: "auto", color: "#ef4444", fontWeight: 700 }}>✗ Incorrect</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="course-page-editor-body" data-tour="video-area">
                    <div
                      className="course-page-body-input"
                      dangerouslySetInnerHTML={{ __html: (activePage.body || "").replace(/(<iframe[^>]*vimeo[^>]*)loading="lazy"/gi, '$1') }}
                      style={{
                        padding: "12px",
                        border: "1px solid #ddd",
                        borderRadius: "4px",
                        whiteSpace: "pre-wrap",
                        minHeight: "auto",
                        maxHeight: "none",
                        overflow: "visible"
                      }}
                    />
                    
                    {((activePage.resourceLinks && activePage.resourceLinks.length > 0) || (activePage.fileUrls && activePage.fileUrls.length > 0)) && (
                      <div style={{ marginTop: 24, padding: "16px", backgroundColor: "var(--surface-subtle)", borderRadius: 8 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Resources</h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {activePage.resourceLinks?.map((link, idx) => (
                            <a
                              key={idx}
                              href={link.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "8px 12px",
                                backgroundColor: "var(--surface-default)",
                                borderRadius: 6,
                                textDecoration: "none",
                                color: "var(--text-primary)",
                                fontSize: 14,
                                border: "1px solid var(--border-default)"
                              }}
                            >
                              <span style={{ fontSize: 18 }}>🔗</span>
                              <span>{link.label}</span>
                            </a>
                          ))}
                          {activePage.fileUrls?.map((fileUrl, idx) => {
                            const file = fileUrl;
                            return (
                              <a
                                key={idx}
                                href={file.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                download
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  padding: "8px 12px",
                                  backgroundColor: "var(--surface-default)",
                                  borderRadius: 6,
                                  textDecoration: "none",
                                  color: "var(--text-primary)",
                                  fontSize: 14,
                                  border: "1px solid var(--border-default)"
                                }}
                              >
                                <span style={{ fontSize: 18 }}>📎</span>
                                <span>{file.label}</span>
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div style={{ padding: "16px", borderTop: "1px solid var(--border-default)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    {progress.isCompleted && (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#10b981", fontWeight: 600 }}>
                        <span>✓</span>
                        <span>Course Completed!</span>
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "12px" }}>
                    {activePage.isQuiz && !quizSubmitted && (
                      <button 
                        type="button" 
                        className="btn-primary" 
                        onClick={handleSubmitQuiz}
                        disabled={Object.keys(selectedAnswers).length !== ((quizQuestionOrder[activePage.id] || activePage.quizQuestions)?.length || 0) || quizSubmitting}
                      >
                        Submit Quiz
                      </button>
                    )}
                    {activePage.isQuiz && quizSubmitted && quizFailAction && (
                      quizFailAction.mode === 'retry'
                        ? <button type="button" className="btn-primary" onClick={() => handleQuizRetry(quizFailAction.pageId)}>Try Again</button>
                        : <button type="button" className="btn-primary" onClick={() => handleQuizRelearn(quizFailAction.prevLessonId)}>Review Lesson</button>
                    )}
                    {activePage.isQuiz && !quizSubmitted && quizError && (
                      <div style={{ alignSelf: 'center', fontSize: 12, color: '#dc2626', fontWeight: 600 }}>{quizError}</div>
                    )}
                    {pages.findIndex(p => p.id === activePage.id) === pages.length - 1 && (!activePage.isQuiz || quizSubmitted) && !progress.isCompleted && (
                      <button 
                        type="button" 
                        className="btn-primary" 
                        onClick={handleCompleteCourse} 
                        style={{ backgroundColor: "#10b981", opacity: (!activePage.isQuiz && !completedPages.has(activePage.id)) ? 0.5 : 1, cursor: (!activePage.isQuiz && !completedPages.has(activePage.id)) ? "not-allowed" : "pointer" }}
                        disabled={!activePage.isQuiz && !completedPages.has(activePage.id)}
                      >
                        ✓ Complete Course
                      </button>
                    )}
                    {(!activePage.isQuiz || quizSubmitted) && pages.findIndex(p => p.id === activePage.id) < pages.length - 1 && (
                      <button 
                        type="button" 
                        className="btn-primary" 
                        onClick={handleNextPage}
                        style={{ opacity: (!activePage.isQuiz && !completedPages.has(activePage.id)) ? 0.5 : 1, cursor: (!activePage.isQuiz && !completedPages.has(activePage.id)) ? "not-allowed" : "pointer" }}
                        disabled={!activePage.isQuiz && !completedPages.has(activePage.id)}
                      >
                        Next Page →
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* AI Chat toggle button - only show if bot is configured for this page */}
        {(() => {
          console.log('AI Chat Button Check:');
          console.log('- courseBot:', courseBot);
          console.log('- courseBot.selectedPages:', courseBot?.selectedPages);
          console.log('- activePage:', activePage);
          console.log('- activePage.id:', activePage?.id);
          console.log('- activePage.title:', activePage?.title);
          const shouldShow = courseBot && courseBot.selectedPages && activePage && courseBot.selectedPages.includes(activePage.id);
          console.log('- Should show button:', shouldShow);
          return shouldShow;
        })() && (
          <button
            data-tour="course-ai"
            onClick={() => setShowAIChat(p => !p)}
            style={{
              position: "fixed", bottom: "24px", right: "24px", zIndex: 500,
              width: 52, height: 52, borderRadius: "50%", border: "none",
              background: "var(--surface-inverse-raised)", color: "var(--text-inverse)", fontSize: "22px",
              cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            title={showAIChat ? "Hide AI Chat" : "Show AI Chat"}
          >
            {showAIChat ? "✕" : "🤖"}
          </button>
        )}

        {/* AI Chat right panel */}
        {showAIChat && activePage && (
          <div style={{
            position: "fixed", top: 64, right: 0, bottom: 0, width: "360px", zIndex: 400,
            background: "var(--surface-default)", borderLeft: "1px solid var(--border-default)",
            boxShadow: "-4px 0 20px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column",
            overflow: "hidden"
          }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-default)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface-subtle)" }}>
              <div style={{ fontWeight: 600, fontSize: "14px" }}>🤖 Course AI Assistant</div>
              <button onClick={() => setShowAIChat(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "18px" }}>✕</button>
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <LessonAIChat
                lessonTitle={activePage.title}
                lessonContent={activePage.body}
                videoUrl={activePage.videoUrl}
                courseTitle={selectedCourse?.title}
                allPages={pages}
                trainingText={activePage.body}
                hasTraining={true}
              />
            </div>
          </div>
        )}
        </div>{/* end desktop-course-view wrapper */}
      </>
    );
  }
}