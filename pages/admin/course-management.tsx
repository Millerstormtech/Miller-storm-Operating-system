import type { NextPage } from "next";
import { useEffect, useState, useRef } from "react";
import { AdminPageWrapper } from "../../src/portals/admin/AdminPageWrapper";
import { CourseManagement } from "../../src/portals/admin/CourseManagement";
import { Course } from "../../src/types";

const CourseManagementPage: NextPage = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestCoursesRef = useRef<Course[]>([]);
  const [deleting, setDeleting] = useState(false);
  const prevCountRef = useRef<number>(0);

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        // Lightweight list (page stubs, no lesson bodies/quiz questions) for a
        // fast Course Builder grid. The full course is fetched on demand when a
        // card is opened (loadFullCourse) before the editor shows.
        const res = await fetch(`/api/courses?summary=1&t=${Date.now()}`);
        if (res.ok && mounted) {
          const data = await res.json();
          const sortedData = data.sort((a: Course, b: Course) => (a.order ?? 999999) - (b.order ?? 999999));
          setCourses(sortedData);
          latestCoursesRef.current = sortedData;
          prevCountRef.current = sortedData.length;
        }
      } catch (error) {
        console.error("Failed to load courses:", error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    loadData();
    return () => { mounted = false; };
  }, []);

  // A "summary" course came from the lightweight list: its pages are stubs with
  // no `body` field. We must NEVER save such a course (it would wipe content).
  function isSummaryCourse(course: any): boolean {
    const pgs = course?.pages;
    return Array.isArray(pgs) && pgs.length > 0 && pgs.every((p: any) => p.body === undefined);
  }

  // Fetch a single course's FULL data and merge it into state, so the editor
  // has lesson bodies + quiz questions before any edit/save happens.
  async function loadFullCourse(courseId: string) {
    try {
      const res = await fetch(`/api/courses/${encodeURIComponent(courseId)}?t=${Date.now()}`);
      if (!res.ok) return;
      const full = await res.json();
      setCourses(prev => {
        const next = prev.map(c => (c.id === full.id ? { ...c, ...full } : c));
        latestCoursesRef.current = next;
        return next;
      });
    } catch (error) {
      console.error("Failed to load full course:", error);
    }
  }

  function cleanCourses(toSave: Course[]) {
    // Safety net: drop any still-summary course so a stub can never overwrite
    // (and wipe) the real lesson content stored in the database.
    return toSave.filter(c => !isSummaryCourse(c)).map(course => {
      const { _id, __v, createdAt, updatedAt, ...cleanCourse } = course as any;
      const cleanedPages = Array.isArray(cleanCourse.pages) ? cleanCourse.pages.map((page: any) => ({
        id: page.id, title: page.title, status: page.status,
        body: page.body || "", folderId: page.folderId,
        videoUrl: page.videoUrl || "", transcript: page.transcript || "",
        pinnedCommunityPostUrl: page.pinnedCommunityPostUrl || "",
        resourceLinks: Array.isArray(page.resourceLinks) ? page.resourceLinks : [],
        fileUrls: Array.isArray(page.fileUrls) ? page.fileUrls : [],
        isQuiz: Boolean(page.isQuiz),
        questionsToShow: page.questionsToShow,
        quizQuestions: Array.isArray(page.quizQuestions) ? page.quizQuestions.map((q: any) => ({
          id: q.id, prompt: q.prompt,
          options: Array.isArray(q.options) ? q.options : [],
          correctIndex: q.correctIndex
        })) : []
      })) : [];
      return {
        ...cleanCourse, pages: cleanedPages,
        folders: Array.isArray(cleanCourse.folders) ? cleanCourse.folders : [],
        links: Array.isArray(cleanCourse.links) ? cleanCourse.links : [],
        quizQuestions: Array.isArray(cleanCourse.quizQuestions) ? cleanCourse.quizQuestions : [],
        lessonNames: Array.isArray(cleanCourse.lessonNames) ? cleanCourse.lessonNames : [],
        assetFiles: Array.isArray(cleanCourse.assetFiles) ? cleanCourse.assetFiles : [],
        marketingDocs: Array.isArray(cleanCourse.marketingDocs) ? cleanCourse.marketingDocs : []
      };
    });
  }

  async function doSave(toSave: Course[]) {
    console.log(`[Save] Starting save for ${toSave.length} courses`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    try {
      const res = await fetch("/api/courses/bulk", {
        method: "PUT", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleanCourses(toSave)),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[Save] API error:', errorText);
        throw new Error(errorText);
      }
      
      console.log('[Save] Successfully saved');
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[Save] Request timeout');
        throw new Error('Save request timed out');
      }
      throw error;
    }
  }

  async function handleDeleteCourse(courseId: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/courses?id=${encodeURIComponent(courseId)}`, {
        method: "DELETE"
      });
      if (!res.ok) {
        throw new Error('Failed to delete course');
      }
      const next = courses.filter(c => c.id !== courseId);
      setCourses(next);
      latestCoursesRef.current = next;
      prevCountRef.current = next.length;
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete course. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleCoursesChange(next: Course[]) {
    // No need to handle delete here anymore — handled by handleDeleteCourse
    prevCountRef.current = next.length;
    setCourses(next);
    latestCoursesRef.current = next;
    // For other changes (like status toggle), save immediately with only the changed course
    // No auto-save - let individual components handle their own saves
  }

  if (isLoading) {
    return (
      <AdminPageWrapper currentView="courseManagement">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
            <div style={{ color: '#6b7280' }}>Loading courses...</div>
          </div>
        </div>
      </AdminPageWrapper>
    );
  }

  return (
    <AdminPageWrapper currentView="courseManagement">
      {deleting && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: "14px", padding: "32px 40px", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: "36px", marginBottom: "12px" }}>🗑️</div>
            <div style={{ fontWeight: 700, fontSize: "16px", color: "#1f2937", marginBottom: "6px" }}>Deleting course...</div>
            <div style={{ fontSize: "13px", color: "#6b7280" }}>Please wait, do not close this page</div>
            <div style={{ marginTop: "16px", display: "flex", justifyContent: "center" }}>
              <div style={{ width: 32, height: 32, border: "3px solid #e5e7eb", borderTop: "3px solid #1f2937", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            </div>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      <CourseManagement courses={courses} onCoursesChange={handleCoursesChange} onDeleteCourse={handleDeleteCourse} onForceSave={doSave} cleanCourses={cleanCourses} onOpenCourse={loadFullCourse} />
    </AdminPageWrapper>
  );
};

export default CourseManagementPage;
