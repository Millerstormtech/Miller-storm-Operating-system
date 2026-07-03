import { useState, useEffect, useRef } from "react";
import { DashboardCard } from "../../components/DashboardCard";
import { AuthenticatedUser, Course } from "../../types";
import { LessonAIChat } from "../../components/LessonAIChat";
import { LessonWatchNote } from "../../components/LessonWatchNote";
import { ShareModal } from "../../components/ShareModal";
import { Toast } from "../../components/Toast";
import { initVideoSequence } from "../../hooks/useVideoSequence";
import { PlaybookTimer } from "../../components/PlaybookTimer";
import { QUIZ_PASS_THRESHOLD, QUIZ_MAX_ATTEMPTS, quizPct, quizPercent, isQuizResultPassing, selectQuizQuestions } from "../../lib/quiz";

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
  selectedModules: string[]; // page IDs
  createdAt: string;
};

export function ManagerOnlineTrainingPage(props: {
  currentUser: AuthenticatedUser;
  courses: Course[];
  isLoading?: boolean;
}) {
  const publishedCourses = props.courses;
  const isLoading = props.isLoading || false;
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [courseViewInitialized, setCourseViewInitialized] = useState<string | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [completedPages, setCompletedPages] = useState<Set<string>>(new Set());
  const [seekToast, setSeekToast] = useState<string | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState<{ correct: number; total: number } | null>(null);
  const [savedQuizResults, setSavedQuizResults] = useState<any[]>([]);
  // Quiz gating (mirrors the Sales TrainingCenter): failed-attempt counter,
  // shuffled question order per quiz, and the pass/fail top-up modal.
  const [quizAttempts, setQuizAttempts] = useState<Record<string, number>>({});
  const [quizQuestionOrder, setQuizQuestionOrder] = useState<Record<string, any[]>>({});
  const [quizModal, setQuizModal] = useState<{ mode: 'retry' | 'relearn'; pageId: string; pct: number; prevLessonId: string | null } | null>(null);
  const [courseCompleted, setCourseCompleted] = useState(false);
  const [activeTab, setActiveTab] = useState<'courses' | 'playlists' | 'team'>('courses');
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [viewingPlaylist, setViewingPlaylist] = useState<Playlist | null>(null);
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
  const [isEditPlaylistOpen, setIsEditPlaylistOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assigningPlaylist, setAssigningPlaylist] = useState<Playlist | null>(null);
  const [salesUsers, setSalesUsers] = useState<any[]>([]);
  const [selectedSalesUser, setSelectedSalesUser] = useState<string[]>([]);
  const [assignedUsers, setAssignedUsers] = useState<Set<string>>(new Set());
  const [assignModalTab, setAssignModalTab] = useState<'assign' | 'unassign'>('assign');
  const [assignDeadline, setAssignDeadline] = useState<string>('');
  const [assignmentsByUser, setAssignmentsByUser] = useState<Record<string, any>>({});
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [teamProgressView, setTeamProgressView] = useState<'courses' | 'playlists'>('courses');
  const [playlistProgressData, setPlaylistProgressData] = useState<Record<string, { user: any; completed: number; total: number; pct: number }[]>>({});
  const [isLoadingPlaylistProgress, setIsLoadingPlaylistProgress] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280); // Default width
  const [isResizing, setIsResizing] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(280);
  const [isFirstPageVisit, setIsFirstPageVisit] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showCourseMenu, setShowCourseMenu] = useState(false);
  const [mobileCourseScreen, setMobileCourseScreen] = useState<'overview' | 'lesson'>('overview');

  // Refs for video sequencing (must live at top level, not inside CourseView)
  const videoCleanupRef = useRef<(() => void) | undefined>(undefined);
  const videoCallbackRef = useRef<(() => void) | undefined>(undefined);
  const [autoPlay, setAutoPlay] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('manager-autoplay') !== 'false';
    }
    return true;
  });
  // Ref so the video sequence always reads the live autoPlay value without re-initing
  const autoPlayRef = useRef(autoPlay);
  autoPlayRef.current = autoPlay;

  // Handle lessonId from query parameter (shared lesson)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const lessonId = params.get('lessonId');
      if (lessonId) {
        // Find the course that contains this lesson
        const courseWithLesson = publishedCourses.find(course =>
          course.pages?.some(page => page.id === lessonId)
        );
        if (courseWithLesson) {
          setSelectedCourse(courseWithLesson);
          setActivePageId(lessonId);
        }
      }
    }
  }, [publishedCourses]);

  // Check for missed playlist deadlines and notify the manager (idempotent;
  // only notifies once per overdue, incomplete assignment).
  useEffect(() => {
    if (props.currentUser?.id) {
      fetch(`/api/playlist-assignments/check-deadlines?managerId=${props.currentUser.id}`, {
        method: 'POST'
      }).catch(err => console.error('Failed to check playlist deadlines:', err));
    }
  }, [props.currentUser?.id]);

  // Load playlists from database
  useEffect(() => {
    if (props.currentUser?.id) {
      fetch(`/api/playlists?managerId=${props.currentUser.id}`)
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
  }, [props.currentUser?.id]);

  const loadPlaylistProgress = async (playlist: Playlist) => {
    if (!playlist.id) return;
    setIsLoadingPlaylistProgress(true);
    try {
      // 1. Get all assignments for this playlist
      const assignmentsRes = await fetch(`/api/playlist-assignments?playlistId=${playlist.id}`);
      const assignments = await assignmentsRes.json();
      
      if (assignments.length === 0) {
        setPlaylistProgressData(prev => ({ ...prev, [playlist.id]: [] }));
        setIsLoadingPlaylistProgress(false);
        return;
      }

      // 2. Get course info to know which modules are lessons
      const course = publishedCourses.find(c => c.id === playlist.courseId);
      if (!course) {
        setPlaylistProgressData(prev => ({ ...prev, [playlist.id]: [] }));
        setIsLoadingPlaylistProgress(false);
        return;
      }

      const totalModules = playlist.selectedModules.length;

      // 3. For each assigned user, get their progress for this course
      const progressPromises = assignments.map(async (assignment: any) => {
        const userId = assignment.assignedToUserId;
        const progRes = await fetch(`/api/course-progress?userId=${userId}&courseIds=${playlist.courseId}`);
        const progData = await progRes.json();
        const courseProg = progData[playlist.courseId] || {};
        
        const quizResults = courseProg.quizResults || [];
        const completedSet = new Set(courseProg.completedPages || []);
        const completedCount = (playlist.selectedModules || []).filter((id: string) => {
          const page = (course.pages || []).find((p: any) => p.id === id);
          return page?.isQuiz
            ? isQuizResultPassing(quizResults.find((r: any) => r.pageId === id))
            : completedSet.has(id);
        }).length;
        const pct = totalModules > 0 ? Math.round((completedCount / totalModules) * 100) : 0;
        
        return {
          user: { id: userId, name: assignment.assignedToUserName },
          completed: completedCount,
          total: totalModules,
          pct: pct
        };
      });

      const results = await Promise.all(progressPromises);
      setPlaylistProgressData(prev => ({ ...prev, [playlist.id]: results }));
    } catch (err) {
      console.error('Failed to load playlist progress:', err);
    } finally {
      setIsLoadingPlaylistProgress(false);
    }
  };

  useEffect(() => {
    if (playlists.length > 0 && publishedCourses.length > 0) {
      // Background load progress for all playlists
      playlists.forEach(playlist => {
        if (!playlistProgressData[playlist.id]) {
          loadPlaylistProgress(playlist);
        }
      });
    }
  }, [playlists, publishedCourses]);

  // Load sales users under this manager
  useEffect(() => {
    if (props.currentUser?.id) {
      console.log('Loading sales users for manager:', props.currentUser.id);
      fetch(`/api/users?role=sales&managerId=${props.currentUser.id}`)
        .then(res => res.json())
        .then(data => {
          console.log('Sales users loaded:', data);
          setSalesUsers(data);
        })
        .catch(err => console.error('Failed to load sales users:', err));
    }
  }, [props.currentUser?.id]);

  useEffect(() => {
    if (selectedCourse) {
      setMobileCourseScreen('overview');
    }
  }, [selectedCourse?.id]);

  // Load already assigned users when modal opens
  useEffect(() => {
    if (isAssignModalOpen && assigningPlaylist) {
      setAssignDeadline('');
      fetch(`/api/playlist-assignments?playlistId=${assigningPlaylist.id}`)
        .then(res => res.json())
        .then(data => {
          const assignedUserIds = new Set<string>(data.map((a: any) => a.assignedToUserId));
          setAssignedUsers(assignedUserIds);
          setSelectedSalesUser(Array.from(assignedUserIds));
          const byUser: Record<string, any> = {};
          data.forEach((a: any) => { byUser[a.assignedToUserId] = a; });
          setAssignmentsByUser(byUser);
        })
        .catch(err => console.error('Failed to load assigned users:', err));
    }
  }, [isAssignModalOpen, assigningPlaylist]);

  useEffect(() => {
    if (selectedCourse && props.currentUser) {
      fetch(`/api/progress?userId=${props.currentUser.id}&courseId=${selectedCourse.id}`)
        .then(res => res.json())
        .then(data => {
          setCompletedPages(new Set(data.completedPages || []));
          setSavedQuizResults(data.quizResults || []);
          setCourseCompleted(data.courseCompleted || false);
        })
        .catch(err => console.error("Failed to load progress:", err));
    }
  }, [selectedCourse, props.currentUser]);

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
    const pages = (selectedCourse.pages ?? []).filter(p => p.status === 'published');
    const page = pages.find(p => p.id === activePageId);
    if (!page) return;
    
    const savedResult = savedQuizResults.find(r => r.pageId === page.id);
    if (savedResult) {
      setSelectedAnswers(savedResult.answers);
      setQuizScore(savedResult.score);
      setQuizSubmitted(true);
    } else {
      setQuizSubmitted(false);
      setQuizScore(null);
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
  const onVideoEndedRef = useRef<() => void>(() => {});

  // Keep the ref updated on every render with fresh closure values
  onVideoEndedRef.current = () => {
    if (!selectedCourse) return;
    let currentPages = (selectedCourse.pages ?? []).filter(p => p.status === 'published');
    if (viewingPlaylist) {
      currentPages = currentPages.filter(p => viewingPlaylist.selectedModules.includes(p.id));
    }
    // Match the folder-grouped sidebar order so "next" goes to the visually-next page.
    currentPages = orderPagesByFolder(currentPages, selectedCourse.folders ?? []);
    const currentIndex = currentPages.findIndex(p => p.id === activePageId);
    if (currentIndex === -1) return;

    // Mark current lesson as completed
    const currentPage = currentPages[currentIndex];
    if (!currentPage.isQuiz) {
      const newCompleted = new Set([...completedPages, currentPage.id]);
      setCompletedPages(newCompleted);
      setCourseProgress(prev => ({
        ...prev,
        [selectedCourse.id]: computeItemProgress(currentPages, newCompleted, savedQuizResults, prev[selectedCourse.id]?.isCompleted),
      }));
      fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: props.currentUser.id,
          courseId: selectedCourse.id,
          completedPages: Array.from(newCompleted)
        })
      }).catch(() => {});
    }

    // Navigate to next page (lesson or quiz)
    if (currentIndex < currentPages.length - 1) {
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
      const isAlreadyCompleted = activePageId ? completedPages.has(activePageId) : false;
      const cleanup = await initVideoSequence(
        container,
        () => onVideoEndedRef.current(),
        autoPlayRef,
        false, // shouldAutoStartFirst
        isAlreadyCompleted,
        () => setSeekToast("You are only able to fast forward if you already completed the video at least once before.")
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

        fetch('/api/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: props.currentUser.id,
            courseId: selectedCourse.id,
            completedPages: Array.from(newCompleted)
          })
        }).catch(() => {});
      }
    }, 1200);

    return () => {
      clearTimeout(timer);
      videoCleanupRef.current?.();
      videoCleanupRef.current = undefined;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePageId, selectedCourse?.id, viewingPlaylist?.id, mobileCourseScreen, completedPages]);

  const [courseProgress, setCourseProgress] = useState<Record<string, { completed: number; total: number; isCompleted: boolean }>>({});
  const [isLoadingProgress, setIsLoadingProgress] = useState(false);
  const [teamProgress, setTeamProgress] = useState<{ user: any; rows: { course: any; completed: number; total: number; isCompleted: boolean }[] }[]>([]);
  const [isLoadingTeam, setIsLoadingTeam] = useState(false);

  // Real average completion across all courses (lesson pages only)
  const managerAverageCompletion = (() => {
    const coursesWithPages = publishedCourses.filter(c => {
      const lessonCount = (c.pages || []).filter(p => p.status === 'published' && !p.isQuiz).length;
      return lessonCount > 0;
    });
    if (coursesWithPages.length === 0) return 0;
    const total = coursesWithPages.reduce((sum, course) => {
      const p = courseProgress[course.id];
      if (!p || p.total === 0) return sum;
      return sum + Math.round((p.completed / p.total) * 100);
    }, 0);
    return Math.round(total / coursesWithPages.length);
  })();

  useEffect(() => {
    const loadProgress = async () => {
      if (publishedCourses.length === 0 || isLoadingProgress) return;
      
      setIsLoadingProgress(true);
      try {
        // Batch load all progress in one API call
        const courseIds = publishedCourses.map(c => c.id).join(',');
        const res = await fetch(`/api/course-progress?userId=${props.currentUser.id}&courseIds=${courseIds}`);
        
        if (res.ok) {
          const data = await res.json();
          const progressMap: Record<string, { completed: number; total: number; isCompleted: boolean }> = {};
          
          publishedCourses.forEach(course => {
            const courseData = data[course.id] || {};
            const publishedPages = (course.pages || []).filter(p => p.status === 'published');
            progressMap[course.id] = computeItemProgress(
              publishedPages,
              new Set(courseData.completedPages || []),
              courseData.quizResults || [],
              courseData.courseCompleted
            );
          });
          
          setCourseProgress(progressMap);
        }
      } catch (err) {
        console.error('Failed to load progress:', err);
      } finally {
        setIsLoadingProgress(false);
      }
    };
    
    // Load progress in background without blocking UI
    if (publishedCourses.length > 0) {
      setTimeout(() => loadProgress(), 0);
    }
  }, [publishedCourses, props.currentUser]);

  // Load team progress when team tab is active
  useEffect(() => {
    if (activeTab !== 'team' || !props.currentUser?.id || publishedCourses.length === 0) return;
    setIsLoadingTeam(true);
    const courseIds = publishedCourses.map(c => c.id).join(',');
    Promise.all([
      fetch(`/api/users?role=sales&managerId=${props.currentUser.id}`).then(r => r.json()),
    ]).then(async ([users]) => {
      const teamUsers = (users || []).filter((u: any) => !u.deleted);
      const results = await Promise.all(
        teamUsers.map(async (user: any) => {
          const res = await fetch(`/api/course-progress?userId=${user.id}&courseIds=${courseIds}`);
          const progData = res.ok ? await res.json() : {};
          const rows = publishedCourses.map(course => {
            const publishedPages = (course.pages || []).filter((p: any) => p.status === 'published');
            const rec = progData[course.id] || {};
            const { completed, total, isCompleted } = computeItemProgress(
              publishedPages,
              new Set(rec.completedPages || []),
              rec.quizResults || [],
              rec.courseCompleted
            );
            return { course, completed, total, isCompleted };
          }).filter(r => r.total > 0);
          return { user, rows };
        })
      );
      setTeamProgress(results);
    }).catch(console.error).finally(() => setIsLoadingTeam(false));
  }, [activeTab, props.currentUser?.id, publishedCourses]);

  // Render modals at top level so they work everywhere
  const renderModals = () => (
    <>
      {/* Playlist Creation Modal */}
      {isCreatePlaylistOpen && selectedCourse && (
        <div className="overlay" style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          backgroundColor: 'rgba(0, 0, 0, 0.5)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          zIndex: 9999 
        }}>
          <div className="dialog" style={{ 
            maxWidth: 700, 
            backgroundColor: 'white', 
            borderRadius: 8, 
            padding: 24,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div className="dialog-title" style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Create Playlist</div>
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
                <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
                  {/* Pages without folders */}
                  {((selectedCourse.pages ?? []).filter(p => p.status === 'published' && !p.folderId)).map((page) => (
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
                  {(selectedCourse.folders ?? []).map((folder) => {
                    const folderPages = (selectedCourse.pages ?? []).filter(p => p.status === 'published' && p.folderId === folder.id);
                    if (folderPages.length === 0) return null;
                    
                    const allFolderPagesSelected = folderPages.every(p => selectedModules.has(p.id));
                    const someFolderPagesSelected = folderPages.some(p => selectedModules.has(p.id));
                    
                    return (
                      <div key={folder.id} style={{ marginTop: 12 }}>
                        <label style={{ display: 'flex', alignItems: 'center', padding: '8px 0', cursor: 'pointer', fontWeight: 600, backgroundColor: '#f3f4f6', paddingLeft: 8, borderRadius: 4 }}>
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
                  if (playlistName.trim() && selectedModules.size > 0) {
                    try {
                      const response = await fetch('/api/playlists', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          name: playlistName,
                          courseId: selectedCourse.id,
                          courseName: selectedCourse.title,
                          selectedModules: Array.from(selectedModules),
                          managerId: props.currentUser.id,
                          managerName: props.currentUser.name,
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

      {/* Edit Playlist Modal */}
      {isEditPlaylistOpen && editingPlaylist && selectedCourse && (
        <div className="overlay" style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          backgroundColor: 'rgba(0, 0, 0, 0.5)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          zIndex: 9999 
        }}>
          <div className="dialog" style={{ 
            maxWidth: 600, 
            backgroundColor: 'white', 
            borderRadius: 8, 
            padding: 24,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div className="dialog-title" style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Edit Playlist</div>
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
                <span className="field-label">Select Modules</span>
                <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
                  {((selectedCourse.pages ?? []).filter(p => p.status === 'published')).map((page) => {
                    const folder = page.folderId ? (selectedCourse.folders ?? []).find(f => f.id === page.folderId) : null;
                    const folderName = folder?.title || '';
                    const displayName = folderName ? `${page.title} (${folderName})` : page.title;
                    return (
                      <label key={page.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 0', cursor: 'pointer' }}>
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
                        <span>{displayName}</span>
                      </label>
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
                  setIsEditPlaylistOpen(false);
                  setEditingPlaylist(null);
                  setPlaylistName('');
                  setSelectedModules(new Set());
                  setSelectedCourse(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary btn-success"
                onClick={async () => {
                  if (playlistName.trim() && selectedModules.size > 0) {
                    try {
                      const response = await fetch('/api/playlists', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          id: editingPlaylist._id || editingPlaylist.id,
                          name: playlistName,
                          selectedModules: Array.from(selectedModules),
                        }),
                      });
                      
                      if (response.ok) {
                        const updatedPlaylist = await response.json();
                        const formattedPlaylist = {
                          ...updatedPlaylist,
                          id: updatedPlaylist._id || updatedPlaylist.id,
                        };
                        const updatedPlaylists = playlists.map(p => 
                          (p.id === editingPlaylist.id || p._id === editingPlaylist._id) ? formattedPlaylist : p
                        );
                        setPlaylists(updatedPlaylists);
                        setIsEditPlaylistOpen(false);
                        setEditingPlaylist(null);
                        setPlaylistName('');
                        setSelectedModules(new Set());
                        setSelectedCourse(null);
                        alert('Playlist updated successfully!');
                      } else {
                        alert('Failed to update playlist');
                      }
                    } catch (error) {
                      console.error('Error updating playlist:', error);
                      alert('Failed to update playlist');
                    }
                  }
                }}
                disabled={!playlistName.trim() || selectedModules.size === 0}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Playlist Modal */}
      {isAssignModalOpen && assigningPlaylist && (
        <div className="overlay" style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          backgroundColor: 'rgba(0, 0, 0, 0.5)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          zIndex: 9999 
        }}>
          <div className="dialog" style={{ 
            maxWidth: 700, 
            backgroundColor: 'white', 
            borderRadius: 8, 
            padding: 24,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div className="dialog-title" style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
              Manage Playlist Assignments
            </div>
            
            <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f3f4f6', borderRadius: 8 }}>
              <strong>Playlist:</strong> {assigningPlaylist.name}
              <div style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
                Course: {assigningPlaylist.courseName}
              </div>
            </div>

            {/* Tab Buttons */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '2px solid #e5e7eb' }}>
              <button
                type="button"
                onClick={() => setAssignModalTab('assign')}
                style={{
                  padding: '12px 24px',
                  background: 'none',
                  border: 'none',
                  borderBottom: assignModalTab === 'assign' ? '2px solid #2563eb' : '2px solid transparent',
                  color: assignModalTab === 'assign' ? '#2563eb' : '#6b7280',
                  fontWeight: assignModalTab === 'assign' ? 600 : 400,
                  cursor: 'pointer',
                  marginBottom: '-2px',
                  fontSize: 16
                }}
              >
                Assign Users
              </button>
              <button
                type="button"
                onClick={() => setAssignModalTab('unassign')}
                style={{
                  padding: '12px 24px',
                  background: 'none',
                  border: 'none',
                  borderBottom: assignModalTab === 'unassign' ? '2px solid #2563eb' : '2px solid transparent',
                  color: assignModalTab === 'unassign' ? '#2563eb' : '#6b7280',
                  fontWeight: assignModalTab === 'unassign' ? 600 : 400,
                  cursor: 'pointer',
                  marginBottom: '-2px',
                  fontSize: 16
                }}
              >
                Unassign Users
              </button>
            </div>

            {/* Assign Tab */}
            {assignModalTab === 'assign' && (
              <div style={{ padding: '16px 0' }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#111827' }}>
                  Available Users
                </div>
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, minHeight: 300, maxHeight: 400, overflowY: 'auto', marginBottom: 16 }}>
                  {salesUsers.filter(u => !assignedUsers.has(u.id)).length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>
                      <div style={{ fontSize: 48, marginBottom: 8 }}>✓</div>
                      All users already assigned
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {salesUsers.filter(u => !assignedUsers.has(u.id)).map(user => (
                        <label key={user.id} style={{ display: 'flex', alignItems: 'center', padding: '12px', cursor: 'pointer', backgroundColor: '#f9fafb', borderRadius: 6, gap: 12, border: '1px solid #e5e7eb', transition: 'all 0.2s' }}>
                          <input
                            type="checkbox"
                            checked={selectedSalesUser.includes(user.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedSalesUser([...selectedSalesUser, user.id]);
                              } else {
                                setSelectedSalesUser(selectedSalesUser.filter(id => id !== user.id));
                              }
                            }}
                            style={{ width: 18, height: 18, cursor: 'pointer' }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 500 }}>{user.name}</div>
                            <div style={{ fontSize: 12, color: '#9ca3af' }}>{user.email}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6, color: '#111827' }}>
                    Deadline <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
                  </label>
                  <input
                    type="date"
                    value={assignDeadline}
                    onChange={(e) => setAssignDeadline(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
                  />
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                    You&apos;ll be notified if a user hasn&apos;t finished the videos and quizzes by this date.
                  </div>
                </div>
                {selectedSalesUser.filter(id => !assignedUsers.has(id)).length > 0 && (
                  <button
                    type="button"
                    className="btn-primary btn-success"
                    onClick={async () => {
                      const usersToAssign = selectedSalesUser.filter(id => !assignedUsers.has(id));
                      if (usersToAssign.length === 0) return;
                      
                      try {
                        for (const userId of usersToAssign) {
                          const selectedUser = salesUsers.find(u => u.id === userId);
                          if (!selectedUser) continue;

                          await fetch('/api/playlist-assignments', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              playlistId: assigningPlaylist.id,
                              playlistName: assigningPlaylist.name,
                              courseId: assigningPlaylist.courseId,
                              courseName: assigningPlaylist.courseName,
                              selectedModules: assigningPlaylist.selectedModules,
                              managerId: props.currentUser.id,
                              managerName: props.currentUser.name,
                              assignedToUserId: selectedUser.id,
                              assignedToUserName: selectedUser.name,
                              deadline: assignDeadline || undefined
                            })
                          });
                        }
                        
                        // Reload assigned users
                        const res = await fetch(`/api/playlist-assignments?playlistId=${assigningPlaylist.id}`);
                        const data = await res.json();
                        const assignedUserIds = new Set<string>(data.map((a: any) => a.assignedToUserId));
                        setAssignedUsers(assignedUserIds);
                        setSelectedSalesUser(Array.from(assignedUserIds));
                        
                        alert(`Assigned to ${usersToAssign.length} user${usersToAssign.length !== 1 ? 's' : ''}!`);
                      } catch (error) {
                        console.error('Error assigning playlist:', error);
                        alert('Failed to assign playlist');
                      }
                    }}
                    style={{ width: '100%' }}
                  >
                    Assign ({selectedSalesUser.filter(id => !assignedUsers.has(id)).length})
                  </button>
                )}
              </div>
            )}

            {/* Unassign Tab */}
            {assignModalTab === 'unassign' && (
              <div style={{ padding: '16px 0' }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#111827' }}>
                  Assigned Users
                </div>
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, minHeight: 300, maxHeight: 400, overflowY: 'auto' }}>
                  {Array.from(assignedUsers).length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>
                      <div style={{ fontSize: 48, marginBottom: 8 }}>📭</div>
                      No users assigned yet
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {salesUsers.filter(u => assignedUsers.has(u.id)).map(user => (
                        <div key={user.id} style={{ display: 'flex', alignItems: 'center', padding: '12px', backgroundColor: '#d1fae5', borderRadius: 6, gap: 12, border: '1px solid #86efac', justifyContent: 'space-between' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 500, color: '#065f46' }}>{user.name}</div>
                            <div style={{ fontSize: 12, color: '#047857' }}>{user.email}</div>
                            {assignmentsByUser[user.id]?.deadline && (
                              <div style={{ fontSize: 12, color: assignmentsByUser[user.id]?.completedAt ? '#047857' : (new Date(assignmentsByUser[user.id].deadline) < new Date() ? '#dc2626' : '#b45309'), marginTop: 2 }}>
                                {assignmentsByUser[user.id]?.completedAt ? '✓ Completed' : '⏰ Due'} {new Date(assignmentsByUser[user.id].deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            className="btn-ghost btn-danger btn-small"
                            onClick={async () => {
                              try {
                                // Find and delete the assignment
                                const res = await fetch(`/api/playlist-assignments?playlistId=${assigningPlaylist.id}`);
                                const assignments = await res.json();
                                const assignment = assignments.find((a: any) => a.assignedToUserId === user.id);
                                
                                if (assignment) {
                                  await fetch(`/api/playlist-assignments?id=${assignment._id}`, {
                                    method: 'DELETE'
                                  });
                                  
                                  // Reload assigned users
                                  const updatedRes = await fetch(`/api/playlist-assignments?playlistId=${assigningPlaylist.id}`);
                                  const updatedData = await updatedRes.json();
                                  const assignedUserIds = new Set<string>(updatedData.map((a: any) => a.assignedToUserId));
                                  setAssignedUsers(assignedUserIds);
                                  setSelectedSalesUser(Array.from(assignedUserIds));
                                  
                                  alert(`Unassigned from ${user.name}!`);
                                }
                              } catch (error) {
                                console.error('Error unassigning playlist:', error);
                                alert('Failed to unassign playlist');
                              }
                            }}
                          >
                            Unassign
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="dialog-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setIsAssignModalOpen(false);
                  setAssigningPlaylist(null);
                  setSelectedSalesUser([]);
                  setAssignModalTab('assign');
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        title={selectedCourse?.pages?.find(p => p.id === activePageId)?.title || 'Lesson'}
        shareUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}/share/lesson/${activePageId || ''}`}
        lessonId={activePageId || ''}
      />
    </>
  );

  return (
    <>
      {renderModals()}
      {seekToast && (
        <Toast message={seekToast} type="info" duration={4000} onClose={() => setSeekToast(null)} />
      )}
      <div className="training-center">
        {/* Always show tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '2px solid #e5e7eb' }}>
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
            style={{
              padding: '16px 32px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'courses' ? '2px solid #2563eb' : '2px solid transparent',
              color: activeTab === 'courses' ? '#2563eb' : '#6b7280',
              fontWeight: activeTab === 'courses' ? 600 : 400,
              cursor: 'pointer',
              marginBottom: '-2px',
              fontSize: 18
            }}
          >
            Courses
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('playlists');
              if (selectedCourse) {
                setSelectedCourse(null);
                setActivePageId(null);
                setViewingPlaylist(null);
                setCourseViewInitialized(null);
              }
            }}
            style={{
              padding: '16px 32px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'playlists' ? '2px solid #2563eb' : '2px solid transparent',
              color: activeTab === 'playlists' ? '#2563eb' : '#6b7280',
              fontWeight: activeTab === 'playlists' ? 600 : 400,
              cursor: 'pointer',
              marginBottom: '-2px',
              fontSize: 18
            }}
          >
            Playlists
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('team');
              if (selectedCourse) {
                setSelectedCourse(null);
                setActivePageId(null);
                setViewingPlaylist(null);
                setCourseViewInitialized(null);
              }
            }}
            style={{
              padding: '16px 32px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'team' ? '2px solid #2563eb' : '2px solid transparent',
              color: activeTab === 'team' ? '#2563eb' : '#6b7280',
              fontWeight: activeTab === 'team' ? 600 : 400,
              cursor: 'pointer',
              marginBottom: '-2px',
              fontSize: 18
            }}
          >
            Team Progress
          </button>
        </div>

        {selectedCourse ? (
          CourseView()
        ) : (
          TabContent()
        )}
      </div>
    </>
  );

  function CourseView() {
    if (!selectedCourse) return null;
    
    let pages = (selectedCourse.pages ?? []).filter(p => p.status === 'published');
    
    // If viewing a playlist, filter to show only selected modules
    if (viewingPlaylist) {
      pages = pages.filter(p => viewingPlaylist.selectedModules.includes(p.id));
    }
    
    let folders = selectedCourse.folders ?? [];
    
    // If viewing a playlist, filter folders to show only those with selected pages
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

    const handleNextPage = () => {
      if (!activePage || !props.currentUser || !selectedCourse) return;
      const currentIndex = pages.findIndex(p => p.id === activePage.id);

      // Only mark lesson pages as completed (not quizzes)
      let newCompleted = completedPages;
      if (!activePage.isQuiz) {
        newCompleted = new Set([...completedPages, activePage.id]);
        setCompletedPages(newCompleted);

        // Update card progress immediately
        setCourseProgress(prev => ({
          ...prev,
          [selectedCourse.id]: computeItemProgress(pages, newCompleted, savedQuizResults, prev[selectedCourse.id]?.isCompleted),
        }));

        fetch('/api/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: props.currentUser.id, courseId: selectedCourse.id, completedPages: Array.from(newCompleted) })
        }).catch(err => console.error("Failed to save progress:", err));
      }

      if (currentIndex < pages.length - 1) {
        setActivePageId(pages[currentIndex + 1].id);
        setTimeout(() => {
          document.querySelector('.course-page-main')?.scrollTo({ top: 0, behavior: 'smooth' });
        }, 100);
      }
    };

    const handleSubmitQuiz = () => {
      if (!activePage?.quizQuestions || !props.currentUser || !selectedCourse) return;
      // Score only against the questions actually shown this attempt (a random
      // subset when the quiz limits how many questions are presented).
      const shownQuestions = quizQuestionOrder[activePage.id] || activePage.quizQuestions;
      let correct = 0;
      shownQuestions.forEach(q => {
        if (selectedAnswers[q.id] === q.correctIndex) correct++;
      });
      const score = { correct, total: shownQuestions.length };
      const passed = quizPct(score) >= QUIZ_PASS_THRESHOLD;
      const pct = quizPercent(score);
      setQuizScore(score);
      setQuizSubmitted(true);

      if (passed) {
        // Passed: persist the result and let the user advance.
        const newResult = { pageId: activePage.id, answers: selectedAnswers, score, passed: true, submittedAt: new Date() };
        const updatedResults = [...savedQuizResults.filter(r => r.pageId !== activePage.id), newResult];
        setSavedQuizResults(updatedResults);
        setQuizAttempts(prev => ({ ...prev, [activePage.id]: 0 }));
        fetch('/api/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: props.currentUser.id, courseId: selectedCourse.id, quizResults: updatedResults })
        }).catch(err => console.error("Failed to save quiz:", err));

        const currentIndex = pages.findIndex(p => p.id === activePage.id);
        if (currentIndex < pages.length - 1) {
          setTimeout(() => { handleNextPage(); }, 1500);
        }
        return;
      }

      // Failed (< 60%): do NOT persist a pass and do NOT advance. Show top-up.
      const attempts = (quizAttempts[activePage.id] || 0) + 1;
      setQuizAttempts(prev => ({ ...prev, [activePage.id]: attempts }));
      if (attempts >= QUIZ_MAX_ATTEMPTS) {
        const idx = pages.findIndex(p => p.id === activePage.id);
        let prevLessonId: string | null = null;
        for (let i = idx - 1; i >= 0; i--) { if (!pages[i].isQuiz) { prevLessonId = pages[i].id; break; } }
        setQuizModal({ mode: 'relearn', pageId: activePage.id, pct, prevLessonId });
        setQuizAttempts(prev => ({ ...prev, [activePage.id]: 0 }));
      } else {
        setQuizModal({ mode: 'retry', pageId: activePage.id, pct, prevLessonId: null });
      }
    };

    // Retry the same quiz: reset answers and reshuffle the question order.
    const handleQuizRetry = (pageId: string) => {
      setQuizModal(null);
      setQuizSubmitted(false);
      setQuizScore(null);
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
      setSelectedAnswers({});
      if (prevLessonId) {
        setActivePageId(prevLessonId);
        setTimeout(() => {
          document.querySelector('.course-page-main')?.scrollTo({ top: 0, behavior: 'smooth' });
        }, 100);
      }
    };

    // Video sequence is handled at parent component level (useEffect above CourseView)
    const handleCompleteCourse = () => {
      if (!props.currentUser || !selectedCourse) return;
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
          userId: props.currentUser.id,
          courseId: selectedCourse.id,
          completedPages: Array.from(newCompleted),
          courseCompleted: true
        })
      }).catch(err => console.error("Failed to complete course:", err));
    };

    const progress = courseProgress[selectedCourse.id] || { completed: 0, total: 0, isCompleted: false };
    const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
    const totalLessons = (selectedCourse.pages ?? []).filter(p => p.status === 'published').length;
    const totalSections = (selectedCourse.folders ?? []).length;

    const MobileOverview = () => (
      <div className="mobile-course-overview">
        {/* Course title + ⋯ menu */}
        <div style={{ padding: '16px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>{selectedCourse.title}</div>
          <div style={{ position: 'relative' }}>
            <button type="button" onClick={() => setShowCourseMenu(p => !p)} style={{ background: 'none', border: 'none', padding: '2px 6px', fontSize: 22, cursor: 'pointer', color: '#374151', letterSpacing: 1 }}>⋯</button>
            {showCourseMenu && (
              <div style={{ position: 'absolute', top: '110%', right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 200, minWidth: 170, padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {!viewingPlaylist && (
                  <button type="button" className="btn-primary btn-small" style={{ width: '100%', textAlign: 'left', backgroundColor: '#111827', color: '#ffffff', border: 'none', fontSize: '14px', fontWeight: 700 }} onClick={() => { setIsCreatePlaylistOpen(true); setShowCourseMenu(false); }}>Make Playlist</button>
                )}
                <button type="button" className="btn-secondary btn-small" style={{ width: '100%', textAlign: 'left', backgroundColor: '#111827', color: '#ffffff', border: 'none', fontSize: '14px', fontWeight: 700 }} onClick={() => { setSelectedCourse(null); setActivePageId(null); setViewingPlaylist(null); setCourseViewInitialized(null); setActiveTab('playlists'); setShowCourseMenu(false); }}>View Playlists</button>
                <button type="button" className="btn-secondary btn-small" style={{ width: '100%', textAlign: 'left', backgroundColor: '#111827', color: '#ffffff', border: 'none', fontSize: '14px', fontWeight: 700 }} onClick={() => { setSelectedCourse(null); setActivePageId(null); setViewingPlaylist(null); setCourseViewInitialized(null); setShowCourseMenu(false); }}>Back to Courses</button>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 4px' }}>
                  <div onClick={() => { const next = !autoPlay; setAutoPlay(next); localStorage.setItem('manager-autoplay', String(next)); }} style={{ width: 36, height: 20, borderRadius: 10, backgroundColor: autoPlay ? '#2563eb' : '#d1d5db', position: 'relative', transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: 2, left: autoPlay ? 18 : 2, width: 16, height: 16, borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </div>
                  <span style={{ fontSize: 13, color: '#374151' }}>Autoplay</span>
                </label>
              </div>
            )}
          </div>
        </div>
        <div style={{ padding: '12px 16px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Course Progress</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Completed {progress.completed} of {progress.total} lessons</div>
          <div style={{ height: 8, borderRadius: 999, background: '#e5e7eb', overflow: 'hidden', marginBottom: 4 }}>
            <div style={{ height: '100%', borderRadius: 999, background: progress.isCompleted ? '#10b981' : '#3b82f6', width: `${pct}%`, transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', textAlign: 'right' }}>{pct}%</div>
        </div>
        <div style={{ padding: '16px 16px 0' }}>
          <button type="button"
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
            style={{ width: '100%', padding: '14px', borderRadius: 999, border: 'none', background: '#111827', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
          >Continue course</button>
        </div>
        <div style={{ padding: '24px 16px 8px' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 2 }}>Course Content</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>{totalSections > 0 ? `${totalSections} Sections • ` : ''}{totalLessons} Lessons</div>
        </div>
        <div style={{ borderTop: '1px solid #e5e7eb' }}>
          {pages.filter(p => !p.folderId).map(page => {
            const unlocked = isPageUnlocked(page.id);
            return (
              <div key={page.id} 
                onClick={() => { 
                  if (unlocked) {
                    setActivePageId(page.id); 
                    setMobileCourseScreen('lesson'); 
                  }
                }}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  padding: '14px 16px', 
                  borderBottom: '1px solid #f1f5f9', 
                  cursor: unlocked ? 'pointer' : 'not-allowed', 
                  background: activePageId === page.id ? '#fef3c7' : '#fff',
                  opacity: unlocked ? 1 : 0.6
                }}
              >
                <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${completedPages.has(page.id) ? '#10b981' : '#d1d5db'}`, background: completedPages.has(page.id) ? '#10b981' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  {completedPages.has(page.id) && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}
                </div>
                <span style={{ fontSize: 14, color: '#111827' }}>
                  {!unlocked && "🔒 "}{page.title}
                </span>
              </div>
            );
          })}
          {folders.map(folder => {
            const folderPages = pages.filter(p => p.folderId === folder.id);
            const isCollapsed = collapsedFolders.has(folder.id);
            return (
              <div key={folder.id}>
                <div onClick={() => { const next = new Set(collapsedFolders); if (isCollapsed) next.delete(folder.id); else next.add(folder.id); setCollapsedFolders(next); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: '#f3f4f6', borderBottom: '1px solid #e5e7eb', cursor: 'pointer' }}
                >
                  <span style={{ fontSize: 13, color: '#6b7280' }}>{isCollapsed ? '∧' : '∨'}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>{folder.title}</span>
                </div>
                {!isCollapsed && folderPages.map(page => {
                  const unlocked = isPageUnlocked(page.id);
                  return (
                    <div key={page.id} 
                      onClick={() => { 
                        if (unlocked) {
                          setActivePageId(page.id); 
                          setMobileCourseScreen('lesson'); 
                        }
                      }}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        padding: '14px 16px 14px 32px', 
                        borderBottom: '1px solid #f1f5f9', 
                        cursor: unlocked ? 'pointer' : 'not-allowed', 
                        background: activePageId === page.id ? '#fef3c7' : '#fff',
                        opacity: unlocked ? 1 : 0.6
                      }}
                    >
                      <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${completedPages.has(page.id) ? '#10b981' : '#d1d5db'}`, background: completedPages.has(page.id) ? '#10b981' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                        {completedPages.has(page.id) && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 14, color: '#111827' }}>
                        {!unlocked && "🔒 "}{page.title}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );

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
            .desktop-course-view { display: none !important; }
            .course-header-desktop-actions { display: flex !important; flex-wrap: wrap; gap: 6px; }
            .course-header-mobile-actions { display: none !important; }
            .panel-header-row { flex-direction: column !important; align-items: flex-start !important; gap: 10px !important; }
          }
          @media (min-width: 768px) {
            .mobile-course-overview { display: none !important; }
            .mobile-lesson-fullpage { display: none !important; }
            .desktop-course-view { display: contents; }
            .course-header-desktop-actions { display: flex !important; }
            .course-header-mobile-actions { display: none !important; }
          }
        `}</style>
        <PlaybookTimer
          userId={props.currentUser.id}
          courseId={selectedCourse.id}
          courseTitle={selectedCourse.title}
          onComplete={async () => {
            const publishedPages = (selectedCourse.pages || []).filter((p: any) => p.status === "published");
            const { completed: done, total } = computeItemProgress(publishedPages, completedPages, savedQuizResults);
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            return { pct, done, total };
          }}
        />

        {/* Quiz top-up modal — shown when a quiz is failed (< 60%) */}
        {quizModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
            <div style={{ background: '#fff', borderRadius: 14, maxWidth: 440, width: '100%', padding: '28px 26px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ fontSize: 44, marginBottom: 8 }}>{quizModal.mode === 'retry' ? '📊' : '📚'}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#16202b', marginBottom: 10 }}>
                {quizModal.mode === 'retry' ? 'Top up your score!' : "Let's revisit the lesson"}
              </div>
              <div style={{ fontSize: 14, color: '#5b6670', lineHeight: 1.55, marginBottom: 22 }}>
                {quizModal.mode === 'retry'
                  ? <>You scored <b>{quizModal.pct}%</b>. You need <b>{Math.round(QUIZ_PASS_THRESHOLD * 100)}%</b> to move on. Give it another try — score above {Math.round(QUIZ_PASS_THRESHOLD * 100)}% and you'll advance to the next step.</>
                  : <>You scored <b>{quizModal.pct}%</b> again. Your performance isn't there yet, so please go through the lesson once more, then retake the quiz.</>}
              </div>
              {quizModal.mode === 'retry' ? (
                <button type="button" className="btn-primary" style={{ width: '100%' }} onClick={() => handleQuizRetry(quizModal.pageId)}>Try Again</button>
              ) : (
                <button type="button" className="btn-primary" style={{ width: '100%' }} onClick={() => handleQuizRelearn(quizModal.prevLessonId)}>Review Lesson</button>
              )}
            </div>
          </div>
        )}

        {/* MOBILE: Overview screen */}
        {mobileCourseScreen === 'overview' && MobileOverview()}

        {/* MOBILE: Lesson screen */}
        {mobileCourseScreen === 'lesson' && activePage && (
          <div className="mobile-lesson-fullpage">
            <button type="button" onClick={() => setMobileCourseScreen('overview')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '12px 16px', fontSize: 14, color: '#374151', fontWeight: 500 }}
            >← Course Content</button>
            <div className="course-page-main">
              <div className="course-page-main-header">
                <h2 className="course-page-title-input" style={{ border: 'none', background: 'none', padding: 0 }}>{activePage.title}</h2>
              </div>
              <LessonWatchNote />
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
                          const isCorrect = q.correctIndex === optIdx;
                          return (
                            <div key={optIdx} onClick={() => !quizSubmitted && setSelectedAnswers({ ...selectedAnswers, [q.id]: optIdx })}
                              style={{ padding: '12px 16px', marginBottom: 12, border: '2px solid', borderColor: quizSubmitted ? (isCorrect ? '#10b981' : isSelected ? '#ef4444' : '#e5e7eb') : (isSelected ? '#3b82f6' : '#e5e7eb'), borderRadius: 8, cursor: quizSubmitted ? 'default' : 'pointer', backgroundColor: quizSubmitted ? (isCorrect ? '#d1fae5' : isSelected ? '#fee2e2' : '#fff') : (isSelected ? '#eff6ff' : '#fff') }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid', borderColor: quizSubmitted ? (isCorrect ? '#10b981' : isSelected ? '#ef4444' : '#d1d5db') : (isSelected ? '#3b82f6' : '#d1d5db'), backgroundColor: isSelected ? (quizSubmitted ? (isCorrect ? '#10b981' : '#ef4444') : '#3b82f6') : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {isSelected && <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#fff' }} />}
                                </div>
                                <span style={{ fontSize: 14 }}>{option}</span>
                                {quizSubmitted && isCorrect && <span style={{ marginLeft: 'auto', color: '#10b981' }}>✓</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="course-page-editor-body">
                  <div className="course-page-body-input"
                    dangerouslySetInnerHTML={{ __html: (activePage.body || '').replace(/(<iframe[^>]*vimeo[^>]*)loading="lazy"/gi, '$1') }}
                    style={{ padding: '12px', border: '1px solid #ddd', borderRadius: '4px', whiteSpace: 'pre-wrap', minHeight: 'auto', maxHeight: 'none', overflow: 'visible' }}
                  />
                </div>
              )}
            </div>
            <div className="mobile-lesson-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {progress.isCompleted && <div style={{ fontSize: 14, color: '#10b981', fontWeight: 600 }}>✓ Course Completed!</div>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {activePage.isQuiz && !quizSubmitted && (
                  <button type="button" className="btn-primary" onClick={handleSubmitQuiz} disabled={Object.keys(selectedAnswers).length !== ((quizQuestionOrder[activePage.id] || activePage.quizQuestions)?.length || 0)}>Submit Quiz</button>
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

        {/* DESKTOP: full layout */}
        <div className="desktop-course-view">
        <div className="panel-header">
          <div className="panel-header-row">
            <span>{selectedCourse.title}</span>
            {/* Desktop: show all buttons inline */}
            <div className="course-header-desktop-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {!viewingPlaylist && (
                <button type="button" className="btn-primary btn-small" style={{ backgroundColor: '#111827', color: '#ffffff', border: 'none', fontSize: '14px', fontWeight: 700 }} onClick={() => setIsCreatePlaylistOpen(true)}>Make Playlist</button>
              )}
              <button type="button" className="btn-secondary btn-small" style={{ backgroundColor: '#111827', color: '#ffffff', border: 'none', fontSize: '14px', fontWeight: 700 }} onClick={() => { setSelectedCourse(null); setActivePageId(null); setViewingPlaylist(null); setCourseViewInitialized(null); setActiveTab('playlists'); }}>View Playlists</button>
              <button type="button" className="btn-secondary btn-small" style={{ backgroundColor: '#111827', color: '#ffffff', border: 'none', fontSize: '14px', fontWeight: 700 }} onClick={() => { setSelectedCourse(null); setActivePageId(null); setViewingPlaylist(null); setCourseViewInitialized(null); }}>Back to Courses</button>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
                <div onClick={() => { const next = !autoPlay; setAutoPlay(next); localStorage.setItem('manager-autoplay', String(next)); }} style={{ width: 40, height: 22, borderRadius: 11, backgroundColor: autoPlay ? '#2563eb' : '#d1d5db', position: 'relative', transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 3, left: autoPlay ? 21 : 3, width: 16, height: 16, borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </div>
                <span style={{ fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>Autoplay</span>
              </label>
            </div>
            {/* Mobile/Tablet: ⋯ menu inline with title */}
            <div className="course-header-mobile-actions" style={{ position: 'relative', display: 'none', alignItems: 'center' }}>
              <button type="button" onClick={() => setShowCourseMenu(p => !p)} style={{ background: 'none', border: 'none', padding: '2px 6px', fontSize: 22, cursor: 'pointer', lineHeight: 1, color: '#374151', letterSpacing: 1 }}>⋯</button>
              {showCourseMenu && (
                <div style={{ position: 'absolute', top: '110%', right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 200, minWidth: 170, padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {!viewingPlaylist && (
                    <button type="button" className="btn-primary btn-small" style={{ width: '100%', textAlign: 'left', backgroundColor: '#111827', color: '#ffffff', border: 'none', fontSize: '14px', fontWeight: 700 }} onClick={() => { setIsCreatePlaylistOpen(true); setShowCourseMenu(false); }}>Make Playlist</button>
                  )}
                  <button type="button" className="btn-secondary btn-small" style={{ width: '100%', textAlign: 'left', backgroundColor: '#111827', color: '#ffffff', border: 'none', fontSize: '14px', fontWeight: 700 }} onClick={() => { setSelectedCourse(null); setActivePageId(null); setViewingPlaylist(null); setCourseViewInitialized(null); setActiveTab('playlists'); setShowCourseMenu(false); }}>View Playlists</button>
                  <button type="button" className="btn-secondary btn-small" style={{ width: '100%', textAlign: 'left', backgroundColor: '#111827', color: '#ffffff', border: 'none', fontSize: '14px', fontWeight: 700 }} onClick={() => { setSelectedCourse(null); setActivePageId(null); setViewingPlaylist(null); setCourseViewInitialized(null); setShowCourseMenu(false); }}>Back to Courses</button>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 4px' }}>
                    <div onClick={() => { const next = !autoPlay; setAutoPlay(next); localStorage.setItem('manager-autoplay', String(next)); }} style={{ width: 36, height: 20, borderRadius: 10, backgroundColor: autoPlay ? '#2563eb' : '#d1d5db', position: 'relative', transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0 }}>
                      <div style={{ position: 'absolute', top: 2, left: autoPlay ? 18 : 2, width: 16, height: 16, borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                    </div>
                    <span style={{ fontSize: 13, color: '#374151' }}>Autoplay</span>
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="course-pages-layout">
          {/* Mobile Overlay */}
          {isMobileSidebarOpen && (
            <div 
              className="course-modules-mobile-overlay active"
              onClick={() => setIsMobileSidebarOpen(false)}
            />
          )}
          
          <div className={`course-pages-left ${isMobileSidebarOpen ? 'mobile-open' : ''}`} style={{ width: `${sidebarWidth}px`, minWidth: '200px', maxWidth: '600px' }}>
            {/* Mobile Header */}
            <div className="course-modules-mobile-header">
              <h3>Course Modules</h3>
            </div>
            
            {/* Expand/Collapse All Buttons */}
            {folders.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>
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
                    <span className="course-pages-item-title">
                      {!unlocked && "🔒 "}{page.title}
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
                          <span className="course-pages-item-title">
                            {!unlocked && "🔒 "}{page.title}
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
              backgroundColor: isResizing ? '#3b82f6' : '#e5e7eb',
              transition: isResizing ? 'none' : 'background-color 0.2s',
              flexShrink: 0,
              position: 'relative',
              zIndex: 10
            }}
            onMouseEnter={(e) => {
              if (!isResizing) e.currentTarget.style.backgroundColor = '#cbd5e1';
            }}
            onMouseLeave={(e) => {
              if (!isResizing) e.currentTarget.style.backgroundColor = '#e5e7eb';
            }}
          />
          <div className="course-page-main">
            {activePage && (
              <>
                <div className="course-page-main-header">
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
                <LessonWatchNote />
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
                            const isCorrect = q.correctIndex === optIdx;
                            const showResult = quizSubmitted;
                            return (
                              <div
                                key={optIdx}
                                onClick={() => !quizSubmitted && setSelectedAnswers({ ...selectedAnswers, [q.id]: optIdx })}
                                style={{
                                  padding: "12px 16px",
                                  marginBottom: 12,
                                  border: "2px solid",
                                  borderColor: showResult ? (isCorrect ? "#10b981" : isSelected ? "#ef4444" : "#e5e7eb") : (isSelected ? "#3b82f6" : "#e5e7eb"),
                                  borderRadius: 8,
                                  cursor: quizSubmitted ? "default" : "pointer",
                                  backgroundColor: showResult ? (isCorrect ? "#d1fae5" : isSelected ? "#fee2e2" : "#fff") : (isSelected ? "#eff6ff" : "#fff")
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                  <div
                                    style={{
                                      width: 20,
                                      height: 20,
                                      borderRadius: "50%",
                                      border: "2px solid",
                                      borderColor: showResult ? (isCorrect ? "#10b981" : isSelected ? "#ef4444" : "#d1d5db") : (isSelected ? "#3b82f6" : "#d1d5db"),
                                      backgroundColor: isSelected ? (showResult ? (isCorrect ? "#10b981" : "#ef4444") : "#3b82f6") : "#fff",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center"
                                    }}
                                  >
                                    {isSelected && <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#fff" }} />}
                                  </div>
                                  <span style={{ fontSize: 14 }}>{option}</span>
                                  {showResult && isCorrect && <span style={{ marginLeft: "auto", color: "#10b981" }}>✓</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="course-page-editor-body">
                    <div
                      className="course-page-body-input"
                      dangerouslySetInnerHTML={{ __html: (activePage.body || "").replace(/(<iframe[^>]*vimeo[^>]*)loading="lazy"/gi, '$1') }}
                      style={{
                        padding: "12px",
                        border: "1px solid #ddd",
                        borderRadius: "4px",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        overflowWrap: "anywhere",
                        width: "100%",
                        maxWidth: "100%",
                        minHeight: "auto",
                        maxHeight: "none",
                        overflow: "visible"
                      }}
                    />
                    
                    {((activePage.resourceLinks && activePage.resourceLinks.length > 0) || (activePage.fileUrls && activePage.fileUrls.length > 0)) && (
                      <div style={{ marginTop: 24, padding: "16px", backgroundColor: "#f9fafb", borderRadius: 8 }}>
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
                                backgroundColor: "#fff",
                                borderRadius: 6,
                                textDecoration: "none",
                                color: "#111827",
                                fontSize: 14,
                                border: "1px solid #e5e7eb"
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
                                  backgroundColor: "#fff",
                                  borderRadius: 6,
                                  textDecoration: "none",
                                  color: "#111827",
                                  fontSize: 14,
                                  border: "1px solid #e5e7eb"
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
                <div style={{ padding: "16px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
                        disabled={Object.keys(selectedAnswers).length !== ((quizQuestionOrder[activePage.id] || activePage.quizQuestions)?.length || 0)}
                      >
                        Submit Quiz
                      </button>
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
          {/* Temporarily hidden - Coming Soon */}
          {/* {activePage && !activePage.isQuiz && <LessonAIChat lessonTitle={activePage.title || selectedCourse.title} lessonContent={activePage.body} videoUrl={activePage.videoUrl} courseTitle={selectedCourse.title} allPages={pages} />} */}
        </div>
        </div>{/* end desktop-course-view */}
      </>
    );
  }

  return (
    <>
      {renderModals()}
      <div className={`training-center${selectedCourse ? (mobileCourseScreen === 'lesson' ? ' mobile-lesson-active' : ' mobile-overview-active') : ''}`}>
        {/* Always show tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '2px solid #e5e7eb' }}>
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
            style={{
              padding: '16px 32px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'courses' ? '2px solid #2563eb' : '2px solid transparent',
              color: activeTab === 'courses' ? '#2563eb' : '#6b7280',
              fontWeight: activeTab === 'courses' ? 600 : 400,
              cursor: 'pointer',
              marginBottom: '-2px',
              fontSize: 18
            }}
          >
            Courses
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('playlists');
              if (selectedCourse) {
                setSelectedCourse(null);
                setActivePageId(null);
                setViewingPlaylist(null);
                setCourseViewInitialized(null);
              }
            }}
            style={{
              padding: '16px 32px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'playlists' ? '2px solid #2563eb' : '2px solid transparent',
              color: activeTab === 'playlists' ? '#2563eb' : '#6b7280',
              fontWeight: activeTab === 'playlists' ? 600 : 400,
              cursor: 'pointer',
              marginBottom: '-2px',
              fontSize: 18
            }}
          >
            Playlists
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('team');
              if (selectedCourse) {
                setSelectedCourse(null);
                setActivePageId(null);
                setViewingPlaylist(null);
                setCourseViewInitialized(null);
              }
            }}
            style={{
              padding: '16px 32px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'team' ? '2px solid #2563eb' : '2px solid transparent',
              color: activeTab === 'team' ? '#2563eb' : '#6b7280',
              fontWeight: activeTab === 'team' ? 600 : 400,
              cursor: 'pointer',
              marginBottom: '-2px',
              fontSize: 18
            }}
          >
            Team Progress
          </button>
        </div>

        {selectedCourse ? (
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
          <div className="grid grid-3" style={{ marginBottom: 16 }}>
            <DashboardCard
              title="Your Online Course Completion"
              value={`${managerAverageCompletion}%`}
              description="Across all published courses"
            />
            <DashboardCard
              title="Available Courses"
              value={publishedCourses.length.toString()}
              description="Published online trainings"
            />
          </div>
          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
              <div style={{ textAlign: 'center' }}>
                <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
                <div style={{ color: '#6b7280' }}>Loading courses...</div>
              </div>
            </div>
          ) : publishedCourses.length === 0 ? (
            <div className="panel" style={{ marginTop: 0 }}>
              <div className="panel-body">
                <div className="panel-empty">
                  No published trainings yet. Publish courses to track progress.
                </div>
              </div>
            </div>
          ) : (
            <div className="training-card-grid">
              {publishedCourses.map((course, index) => {
                const progress = courseProgress[course.id] || { completed: 0, total: 0, isCompleted: false };
                return (
                  <button
                    key={course.id}
                    type="button"
                    className="training-card"
                    onClick={() => {
                      const firstPage = (course.pages ?? []).filter(p => p.status === 'published')[0];
                      setActivePageId(firstPage?.id ?? null);
                      setSelectedCourse(course);
                    }}
                    style={{ cursor: "pointer", border: "none", background: "none", padding: 0, textAlign: "left" }}
                  >
                    <div 
                      className="training-card-image"
                      style={
                        course.coverImageUrl
                          ? { backgroundImage: `url(${course.coverImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                          : undefined
                      }
                    >
                      <div className="training-card-image-overlay">
                        {course.tagline && (
                          <span className="training-card-chip">
                            {course.tagline}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="training-card-body">
                      <div className="training-card-title">{course.title}</div>
                      {progress.total > 0 && (
                        <div className="training-card-progress-row">
                          <div className="training-card-progress-track">
                            <div
                              className="training-card-progress-fill"
                              style={{
                                width: `${Math.round((progress.completed / progress.total) * 100)}%`,
                                background: progress.isCompleted ? '#10b981' : '#22c55e'
                              }}
                            />
                          </div>
                          <span className="training-card-progress-label">
                            {progress.isCompleted ? '✓ 100%' : `${Math.round((progress.completed / progress.total) * 100)}%`}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      );
    }

    if (activeTab === 'playlists') {
      return (
        <div className="panel">
          <div className="panel-header">
            <span>My Playlists</span>
          </div>
          <div className="panel-body">
            {playlists.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }}>📋</div>
                <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                  No Playlists Yet
                </h3>
                <p>Create a playlist by clicking "Make Playlist" when viewing a course</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 16 }} className="playlist-grid">
                {playlists.map((playlist) => (
                  <div key={playlist.id} className="card playlist-card" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }} className="playlist-card-content">
                      <div style={{ flex: 1 }} className="playlist-card-info">
                        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#111827' }} className="playlist-card-title">
                          {playlist.name}
                        </div>
                        <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>
                          Course: {playlist.courseName}
                        </div>
                        <div style={{ fontSize: 14, color: '#6b7280' }}>
                          {playlist.selectedModules.length} module{playlist.selectedModules.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 12 }} className="playlist-card-actions">
                        <button
                          type="button"
                          className="btn-primary playlist-action-btn"
                          onClick={() => {
                            const course = publishedCourses.find(c => c.id === playlist.courseId);
                            if (course) {
                              const playlistPages = (course.pages ?? [])
                                .filter(p => p.status === 'published' && playlist.selectedModules.includes(p.id))
                                .sort((a, b) => playlist.selectedModules.indexOf(a.id) - playlist.selectedModules.indexOf(b.id));
                              setActivePageId(playlistPages[0]?.id ?? null);
                              setViewingPlaylist({
                                ...playlist,
                                id: playlist._id || playlist.id,
                              });
                              setSelectedCourse(course);
                            }
                          }}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="btn-secondary playlist-action-btn"
                          onClick={() => {
                            const course = publishedCourses.find(c => c.id === playlist.courseId);
                            if (course) {
                              setEditingPlaylist(playlist);
                              setPlaylistName(playlist.name);
                              setSelectedModules(new Set(playlist.selectedModules));
                              setSelectedCourse(course);
                              setIsEditPlaylistOpen(true);
                            }
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-secondary playlist-action-btn"
                          onClick={() => {
                            setAssigningPlaylist({
                              ...playlist,
                              id: playlist._id || playlist.id,
                            });
                            setIsAssignModalOpen(true);
                          }}
                        >
                          Assign
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-danger playlist-action-btn"
                          onClick={async () => {
                            if (confirm('Delete this playlist?')) {
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

    if (activeTab === 'team') {
      return (
        <div className="panel">
          <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Team Training Progress</span>
            <div style={{ display: 'flex', background: '#f3f4f6', padding: '4px', borderRadius: '8px', gap: '4px' }}>
              <button
                type="button"
                onClick={() => setTeamProgressView('courses')}
                style={{
                  padding: '6px 16px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: teamProgressView === 'courses' ? '#fff' : 'transparent',
                  color: teamProgressView === 'courses' ? '#111827' : '#6b7280',
                  boxShadow: teamProgressView === 'courses' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.2s'
                }}
              >
                Courses Progress
              </button>
              <button
                type="button"
                onClick={() => setTeamProgressView('playlists')}
                style={{
                  padding: '6px 16px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: teamProgressView === 'playlists' ? '#fff' : 'transparent',
                  color: teamProgressView === 'playlists' ? '#111827' : '#6b7280',
                  boxShadow: teamProgressView === 'playlists' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.2s'
                }}
              >
                Playlist Progress
              </button>
            </div>
          </div>
          <div className="panel-body">
            {isLoadingTeam ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>Loading...</div>
            ) : (teamProgress.length === 0 && playlists.length === 0) ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>No team members or playlists found.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                {/* Courses Section */}
                {teamProgressView === 'courses' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {publishedCourses.filter(c => (c.pages || []).some((p: any) => p.status === 'published' && !p.isQuiz)).length > 0 ? (
                      publishedCourses.filter(c => (c.pages || []).some((p: any) => p.status === 'published' && !p.isQuiz)).map(course => {
                        const total = (course.pages || []).filter((p: any) => p.status === 'published').length;
                        return (
                          <div key={course.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                            <div style={{ padding: '14px 20px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', fontWeight: 700, fontSize: 15, color: '#111827' }}>
                              {course.title}
                              <span style={{ fontWeight: 400, fontSize: 13, color: '#6b7280', marginLeft: 8 }}>{total} item{total !== 1 ? 's' : ''}</span>
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ background: '#f1f5f9' }}>
                                  <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#374151' }}>User Name</th>
                                  <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#374151' }}>Course Progress</th>
                                  <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#374151' }}>Lessons Completed</th>
                                  <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#374151' }}>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {teamProgress.map(({ user, rows }) => {
                                  const row = rows.find(r => r.course.id === course.id) || { completed: 0, total, isCompleted: false };
                                  const pct = total > 0 ? Math.round((row.completed / total) * 100) : 0;
                                  return (
                                    <tr key={user.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                      <td style={{ padding: '12px 20px', fontSize: 14, color: '#111827', fontWeight: 500 }}>{user.name}</td>
                                      <td style={{ padding: '12px 20px', minWidth: 160 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                          <div style={{ flex: 1, height: 8, borderRadius: 999, background: '#e5e7eb', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', borderRadius: 999, background: row.isCompleted ? '#10b981' : '#22c55e', width: `${pct}%` }} />
                                          </div>
                                          <span style={{ fontSize: 13, fontWeight: 600, color: row.isCompleted ? '#10b981' : '#374151', minWidth: 36 }}>{pct}%</span>
                                        </div>
                                      </td>
                                      <td style={{ padding: '12px 20px', fontSize: 14, color: '#374151' }}>{row.completed} / {total}</td>
                                      <td style={{ padding: '12px 20px' }}>
                                        {row.isCompleted ? (
                                          <span style={{ background: '#d1fae5', color: '#065f46', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>✓ Completed</span>
                                        ) : pct === 0 ? (
                                          <span style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>Not Started</span>
                                        ) : (
                                          <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>In Progress</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        );
                      })
                    ) : (
                      <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>No courses found.</div>
                    )}
                  </div>
                )}

                {/* Playlists Section */}
                {teamProgressView === 'playlists' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {playlists.length > 0 ? (
                      playlists.map(playlist => {
                        const total = playlist.selectedModules.length;
                        const progressRows = playlistProgressData[playlist.id] || [];
                        
                        return (
                          <div key={playlist.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                            <div style={{ padding: '14px 20px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', fontWeight: 700, fontSize: 15, color: '#111827' }}>
                              {playlist.name}
                              <span style={{ fontWeight: 400, fontSize: 13, color: '#6b7280', marginLeft: 8 }}>{total} module{total !== 1 ? 's' : ''} • Course: {playlist.courseName}</span>
                            </div>
                            {progressRows.length === 0 ? (
                              <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>No users assigned to this playlist yet.</div>
                            ) : (
                              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr style={{ background: '#f1f5f9' }}>
                                    <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#374151' }}>User Name</th>
                                    <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#374151' }}>Playlist Progress</th>
                                    <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#374151' }}>Modules Completed</th>
                                    <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#374151' }}>Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {progressRows.map((row, idx) => {
                                    return (
                                      <tr key={idx} style={{ borderTop: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '12px 20px', fontSize: 14, color: '#111827', fontWeight: 500 }}>{row.user.name}</td>
                                        <td style={{ padding: '12px 20px', minWidth: 160 }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{ flex: 1, height: 8, borderRadius: 999, background: '#e5e7eb', overflow: 'hidden' }}>
                                              <div style={{ height: '100%', borderRadius: 999, background: row.pct === 100 ? '#10b981' : '#3b82f6', width: `${row.pct}%` }} />
                                            </div>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: row.pct === 100 ? '#10b981' : '#374151', minWidth: 36 }}>{row.pct}%</span>
                                          </div>
                                        </td>
                                        <td style={{ padding: '12px 20px', fontSize: 14, color: '#374151' }}>{row.completed} / {row.total}</td>
                                        <td style={{ padding: '12px 20px' }}>
                                          {row.pct === 100 ? (
                                            <span style={{ background: '#d1fae5', color: '#065f46', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>✓ Completed</span>
                                          ) : row.pct === 0 ? (
                                            <span style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>Not Started</span>
                                          ) : (
                                            <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>In Progress</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>No playlists found.</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return null;
  }
}
