import { useRef, useState, useEffect } from "react";
import { Course, CoursePage, CourseFolder } from "../../types";
import { Toast } from "../../components/Toast";
import { parseQuestionsDoc, validateQuestions } from "../../lib/quizImport";
import { isQuizResultPassing } from "../../lib/quiz";

type CourseEditorProps = {
  courses: Course[];
  onCoursesChange: (courses: Course[]) => void;
  onDeleteCourse: (courseId: string) => Promise<void>;
  onForceSave?: (courses: Course[]) => Promise<void>;
  cleanCourses?: (courses: Course[]) => Course[];
};

export function CourseManagement(props: CourseEditorProps) {
  const [selectedCourseId, setSelectedCourseId] = useState(props.courses[0]?.id ?? "");
  const [viewMode, setViewMode] = useState<"grid" | "detail" | "progress">("grid");
  const [progressCourseId, setProgressCourseId] = useState<string | null>(null);
  const [progressData, setProgressData] = useState<any[]>([]);
  const [progressUsers, setProgressUsers] = useState<any[]>([]);
  const [progressSearch, setProgressSearch] = useState('');
  const [progressRoleFilter, setProgressRoleFilter] = useState('all');
  const [isLoadingProgress, setIsLoadingProgress] = useState(false);
  const [page, setPage] = useState(1);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const [detailSection, setDetailSection] = useState<"overview" | "pages">("overview");
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [openPageMenuId, setOpenPageMenuId] = useState<string | null>(null);
  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null);
  const [isCourseMenuOpen, setIsCourseMenuOpen] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderPublished, setNewFolderPublished] = useState(true);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [videoUrlDraft, setVideoUrlDraft] = useState("");
  const videoFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [imageUrlDraft, setImageUrlDraft] = useState("");
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [draggedCourseId, setDraggedCourseId] = useState<string | null>(null);
  const [linkLabelDraft, setLinkLabelDraft] = useState("");
  const [linkUrlDraft, setLinkUrlDraft] = useState("");
  const [isResourceFileModalOpen, setIsResourceFileModalOpen] = useState(false);
  const [resourceFileUrlDraft, setResourceFileUrlDraft] = useState("");
  const [resourceFileLabelDraft, setResourceFileLabelDraft] = useState("");
  const [isPinPostModalOpen, setIsPinPostModalOpen] = useState(false);
  const [pinPostUrlDraft, setPinPostUrlDraft] = useState("");
  // Bulk "Import Quizzes" feature
  const [isImportQuizModalOpen, setIsImportQuizModalOpen] = useState(false);
  const [importDocText, setImportDocText] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importReport, setImportReport] = useState<any | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const resourceFileInputRef = useRef<HTMLInputElement | null>(null);
  const bodyInputRef = useRef<HTMLDivElement | null>(null);
  const [lastPageId, setLastPageId] = useState<string | null>(null);
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [originalCourse, setOriginalCourse] = useState<Course | null>(null);
  const [isCreatingNewCourse, setIsCreatingNewCourse] = useState(false);
  const [newCourseData, setNewCourseData] = useState<Course | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  // 3-step delete modal
  type DeleteStep = 'choose' | 'select' | 'confirm';
  type DeleteTarget = 'lesson' | 'module' | 'course';
  const [deleteStep, setDeleteStep] = useState<DeleteStep>('choose');
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteSelectedIds, setDeleteSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  function openDeleteModal() {
    setDeleteStep('choose');
    setDeleteTarget(null);
    setDeleteSelectedIds(new Set());
    setIsDeleteModalOpen(true);
  }
  function closeDeleteModal() {
    setIsDeleteModalOpen(false);
    setDeleteTarget(null);
    setDeleteSelectedIds(new Set());
    setDeleteStep('choose');
  }
  function confirmDelete() {
    if (!selectedCourse) return;
    if (deleteTarget === 'course') {
      deleteCourse(selectedCourse.id);
    } else if (deleteTarget === 'lesson') {
      const nextPages = (selectedCourse.pages ?? []).filter(p => !deleteSelectedIds.has(p.id));
      updateCourse({ ...selectedCourse, pages: nextPages });
      if (activePageId && deleteSelectedIds.has(activePageId)) {
        const fallback = nextPages[nextPages.length - 1] ?? nextPages[0];
        setActivePageId(fallback ? fallback.id : null);
      }
    } else if (deleteTarget === 'module') {
      const remainingFolders = (selectedCourse.folders ?? []).filter(f => !deleteSelectedIds.has(f.id));
      const remainingPages = (selectedCourse.pages ?? []).filter(p => !deleteSelectedIds.has(p.folderId ?? ''));
      updateCourse({ ...selectedCourse, folders: remainingFolders, pages: remainingPages });
      if (activePageId && !remainingPages.some(p => p.id === activePageId)) {
        const fallback = remainingPages[remainingPages.length - 1] ?? remainingPages[0];
        setActivePageId(fallback ? fallback.id : null);
      }
    }
    closeDeleteModal();
  }
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(280);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverPageId, setDragOverPageId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'above' | 'below' | null>(null);
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [openResourceMenuId, setOpenResourceMenuId] = useState<string | null>(null);
  const [editingResourceIndex, setEditingResourceIndex] = useState<number | null>(null);
  const [editingResourceType, setEditingResourceType] = useState<'link' | 'file' | null>(null);
  const [isChangeModuleModalOpen, setIsChangeModuleModalOpen] = useState(false);
  const [changeModulePageId, setChangeModulePageId] = useState<string | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<string | undefined>(undefined);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');
  const [isSavingLesson, setIsSavingLesson] = useState(false);
  const [savingMessage, setSavingMessage] = useState<string>("");
  const [isSavingCourse, setIsSavingCourse] = useState(false);
  const [isSavingModule, setIsSavingModule] = useState(false);

  // Add drag and drop styles
  const dragStyles = `
    <style>
      .course-pages-sidebar.drag-active .course-folder-group {
        transition: all 0.2s ease;
      }
      .course-folder-group.drag-over {
        background-color: #e0f2fe !important;
        border: 2px dashed #0ea5e9 !important;
        border-radius: 8px;
      }
      .course-pages-item.dragging {
        opacity: 0.5;
        transform: rotate(2deg);
      }
    </style>
  `;

  // Inject styles
  if (typeof document !== 'undefined' && !document.getElementById('drag-drop-styles')) {
    const styleElement = document.createElement('style');
    styleElement.id = 'drag-drop-styles';
    styleElement.innerHTML = `
      .course-pages-sidebar.drag-active .course-folder-group {
        transition: all 0.2s ease;
      }
      .course-folder-group.drag-over {
        background-color: #e0f2fe !important;
        border: 2px dashed #0ea5e9 !important;
        border-radius: 8px;
      }
      .course-folder-group.dragging {
        opacity: 0.5;
        transform: rotate(1deg);
      }
      .course-folder-group.drag-over-above::before {
        content: '';
        position: absolute;
        top: -2px;
        left: 0;
        right: 0;
        height: 4px;
        background-color: #0ea5e9;
        border-radius: 2px;
      }
      .course-folder-group.drag-over-below::after {
        content: '';
        position: absolute;
        bottom: -2px;
        left: 0;
        right: 0;
        height: 4px;
        background-color: #0ea5e9;
        border-radius: 2px;
      }
      .course-pages-item.dragging {
        opacity: 0.5;
        transform: rotate(2deg);
      }
      .course-pages-item.drag-over-above::before {
        content: '';
        position: absolute;
        top: -2px;
        left: 0;
        right: 0;
        height: 4px;
        background-color: #0ea5e9;
        border-radius: 2px;
      }
      .course-pages-item.drag-over-below::after {
        content: '';
        position: absolute;
        bottom: -2px;
        left: 0;
        right: 0;
        height: 4px;
        background-color: #0ea5e9;
        border-radius: 2px;
      }
      .course-pages-item {
        position: relative;
      }
      .course-folder-group {
        position: relative;
      }
      /* Hide share and delete buttons in view mode (non-editable content) */
      .course-page-body-input:not([contenteditable="true"]) [data-video-share],
      .course-page-body-input:not([contenteditable="true"]) .video-delete-btn,
      .course-page-body-input:not([contenteditable="true"]) .image-delete-btn {
        display: none !important;
      }
      /* Ensure video buttons are clickable and don't trigger contenteditable */
      [data-video-type] button,
      [data-video-type] a,
      [data-image-container] button {
        pointer-events: auto !important;
        user-select: none;
      }
      [data-video-type] iframe {
        pointer-events: auto;
      }
    `;
    document.head.appendChild(styleElement);
  }

  const visibleCourses = props.courses;

  const selectedCourse = isCreatingNewCourse ? newCourseData : props.courses.find((course) => course.id === selectedCourseId);

  // Show toast notification
  function showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
    setToastMessage(message);
    setToastType(type);
  }

  // Track changes when course is selected
  useEffect(() => {
    if (selectedCourse && viewMode === "detail") {
      setOriginalCourse(JSON.parse(JSON.stringify(selectedCourse)));
      setHasChanges(false);
    }
  }, [selectedCourseId, viewMode]);

  // Check for changes
  useEffect(() => {
    if (originalCourse && selectedCourse) {
      const hasChanged = JSON.stringify(originalCourse) !== JSON.stringify(selectedCourse);
      setHasChanges(hasChanged);
    }
  }, [selectedCourse, originalCourse]);

  // Cleanup drag state on escape key or when component unmounts
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDraggedPageId(null);
        setDraggedFolderId(null);
        setDragOverFolderId(null);
        setDragOverPageId(null);
        setDragOverPosition(null);
        setDraggedCourseId(null);
      }
    };

    const handleMouseUp = () => {
      // Reset drag state after a short delay if mouse is released
      setTimeout(() => {
        if (draggedPageId || draggedFolderId || draggedCourseId) {
          console.log('Cleaning up stuck drag state');
          setDraggedPageId(null);
          setDraggedFolderId(null);
          setDragOverFolderId(null);
          setDragOverPageId(null);
          setDragOverPosition(null);
          setDraggedCourseId(null);
        }
      }, 100);
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggedPageId, draggedFolderId, draggedCourseId]);

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

  useEffect(() => {
    if (bodyInputRef.current && activePageId) {
      const course = props.courses.find((c) => c.id === selectedCourseId);
      const page = course?.pages?.find((p) => p.id === activePageId);
      if (page && bodyInputRef.current.innerHTML !== page.body) {
        console.log('[CourseManagement] Loading page body:', {
          pageId: page.id,
          pageTitle: page.title,
          bodyLength: page.body?.length || 0,
          bodyPreview: page.body?.substring(0, 200)
        });
        
        let bodyHtml = page.body || "";
        
        // Convert Vimeo video tags to iframes
        if (bodyHtml.includes('vimeo.com')) {
          bodyHtml = bodyHtml.replace(/<video([^>]*)src="([^"]*vimeo\.com[^"]*)"([^>]*)><\/video>/gi, (match, before, src, after) => {
            const vimeoMatch = src.match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/([a-zA-Z0-9]+))?/);
            if (vimeoMatch) {
              const videoId = vimeoMatch[1];
              const hash = vimeoMatch[2];
              const embedUrl = hash ? `https://player.vimeo.com/video/${videoId}?h=${hash}` : `https://player.vimeo.com/video/${videoId}`;
              return `<iframe src="${embedUrl}" style="width: 100%; height: 100%; border: none;" allow="autoplay; fullscreen; picture-in-picture"></iframe>`;
            }
            return match;
          });
        }
        
        // Migrate old YouTube videos to new format with share button
        bodyHtml = bodyHtml.replace(/<div contenteditable="false" style="margin: 16px auto; max-width: 640px;[^"]*"[^>]*data-video-type="youtube" data-video-id="([^"]+)"[^>]*>[\s\S]*?<\/div>/gi, (match, videoId) => {
          const shareUrl = `https://www.youtube.com/watch?v=${videoId}`;
          return `<div contenteditable="false" style="margin: 16px auto; max-width: 640px; position: relative;" data-video-type="youtube" data-video-id="${videoId}" data-share-url="${shareUrl}">
            <div style="position: relative; aspect-ratio: 16/9; background: #000; border-radius: 12px; overflow: hidden;">
              <iframe src="https://www.youtube.com/embed/${videoId}" style="width: 100%; height: 100%; border: none;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"></iframe>
              <div style="position: absolute; top: 12px; left: 12px; display: flex; gap: 8px; z-index: 10;">
                <button type="button" data-video-share title="Copy Link" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: rgba(239, 68, 68, 0.9); color: white; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; backdrop-filter: blur(4px);" onmouseover="this.style.background='rgba(220, 38, 38, 0.95)'; this.style.transform='scale(1.05)'" onmouseout="this.style.background='rgba(239, 68, 68, 0.9)'; this.style.transform='scale(1)'">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                </button>
                <button type="button" data-video-delete title="Delete Video" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: rgba(107, 114, 128, 0.9); color: white; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; backdrop-filter: blur(4px);" onmouseover="this.style.background='rgba(75, 85, 99, 0.95)'; this.style.transform='scale(1.05)'" onmouseout="this.style.background='rgba(107, 114, 128, 0.9)'; this.style.transform='scale(1)'" class="video-delete-btn">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
              </div>
            </div>
          </div>`;
        });
        
        // Also migrate really old YouTube format without data attributes
        bodyHtml = bodyHtml.replace(/<div contenteditable="false" style="margin: 16px auto; max-width: 640px; aspect-ratio: 16\/9; background: #000; border-radius: 12px; overflow: hidden;"><iframe src="https:\/\/www\.youtube\.com\/embed\/([^"]+)"([^>]*)><\/iframe><\/div>/gi, (match, videoId) => {
          const shareUrl = `https://www.youtube.com/watch?v=${videoId}`;
          return `<div contenteditable="false" style="margin: 16px auto; max-width: 640px; position: relative;" data-video-type="youtube" data-video-id="${videoId}" data-share-url="${shareUrl}">
            <div style="position: relative; aspect-ratio: 16/9; background: #000; border-radius: 12px; overflow: hidden;">
              <iframe src="https://www.youtube.com/embed/${videoId}" style="width: 100%; height: 100%; border: none;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"></iframe>
              <div style="position: absolute; top: 12px; left: 12px; display: flex; gap: 8px; z-index: 10;">
                <button type="button" data-video-share title="Copy Link" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: rgba(239, 68, 68, 0.9); color: white; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; backdrop-filter: blur(4px);" onmouseover="this.style.background='rgba(220, 38, 38, 0.95)'; this.style.transform='scale(1.05)'" onmouseout="this.style.background='rgba(239, 68, 68, 0.9)'; this.style.transform='scale(1)'">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                </button>
                <button type="button" data-video-delete title="Delete Video" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: rgba(107, 114, 128, 0.9); color: white; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; backdrop-filter: blur(4px);" onmouseover="this.style.background='rgba(75, 85, 99, 0.95)'; this.style.transform='scale(1.05)'" onmouseout="this.style.background='rgba(107, 114, 128, 0.9)'; this.style.transform='scale(1)'" class="video-delete-btn">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
              </div>
            </div>
          </div>`;
        });
        
        // Migrate old Vimeo videos to new format with share button
        bodyHtml = bodyHtml.replace(/<div contenteditable="false" style="margin: 16px auto; max-width: 640px;[^"]*"[^>]*data-video-type="vimeo" data-video-id="([^"]+)"[^>]*>[\s\S]*?<\/div>/gi, (match, videoId) => {
          // Try to extract hash if present in the match
          const hashMatch = match.match(/vimeo\.com\/video\/\d+\?h=([a-zA-Z0-9]+)/);
          const hash = hashMatch ? hashMatch[1] : null;
          const embedUrl = hash ? `https://player.vimeo.com/video/${videoId}?h=${hash}` : `https://player.vimeo.com/video/${videoId}`;
          const shareUrl = hash ? `https://vimeo.com/${videoId}/${hash}` : `https://vimeo.com/${videoId}`;
          return `<div contenteditable="false" style="margin: 16px auto; max-width: 640px; position: relative;" data-video-type="vimeo" data-video-id="${videoId}" data-share-url="${shareUrl}">
            <div style="position: relative; aspect-ratio: 16/9; background: #000; border-radius: 12px; overflow: hidden;">
              <iframe src="${embedUrl}" style="width: 100%; height: 100%; border: none;" allow="autoplay; fullscreen; picture-in-picture"></iframe>
              <div style="position: absolute; top: 12px; left: 12px; display: flex; gap: 8px; z-index: 10;">
                <button type="button" data-video-share title="Copy Link" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: rgba(239, 68, 68, 0.9); color: white; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; backdrop-filter: blur(4px);" onmouseover="this.style.background='rgba(220, 38, 38, 0.95)'; this.style.transform='scale(1.05)'" onmouseout="this.style.background='rgba(239, 68, 68, 0.9)'; this.style.transform='scale(1)'">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                </button>
                <button type="button" data-video-delete title="Delete Video" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: rgba(107, 114, 128, 0.9); color: white; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; backdrop-filter: blur(4px);" onmouseover="this.style.background='rgba(75, 85, 99, 0.95)'; this.style.transform='scale(1.05)'" onmouseout="this.style.background='rgba(107, 114, 128, 0.9)'; this.style.transform='scale(1)'" class="video-delete-btn">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
              </div>
            </div>
          </div>`;
        });
        
        // Also migrate really old Vimeo format without data attributes
        bodyHtml = bodyHtml.replace(/<div contenteditable="false" style="margin: 16px auto; max-width: 640px; aspect-ratio: 16\/9; background: #000; border-radius: 12px; overflow: hidden;"><iframe src="https:\/\/player\.vimeo\.com\/video\/(\d+)(\?h=([a-zA-Z0-9]+))?"([^>]*)><\/iframe><\/div>/gi, (match, videoId, hashPart, hash) => {
          const embedUrl = hash ? `https://player.vimeo.com/video/${videoId}?h=${hash}` : `https://player.vimeo.com/video/${videoId}`;
          const shareUrl = hash ? `https://vimeo.com/${videoId}/${hash}` : `https://vimeo.com/${videoId}`;
          return `<div contenteditable="false" style="margin: 16px auto; max-width: 640px; position: relative;" data-video-type="vimeo" data-video-id="${videoId}" data-share-url="${shareUrl}">
            <div style="position: relative; aspect-ratio: 16/9; background: #000; border-radius: 12px; overflow: hidden;">
              <iframe src="${embedUrl}" style="width: 100%; height: 100%; border: none;" allow="autoplay; fullscreen; picture-in-picture"></iframe>
              <div style="position: absolute; top: 12px; left: 12px; display: flex; gap: 8px; z-index: 10;">
                <button type="button" data-video-share title="Copy Link" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: rgba(239, 68, 68, 0.9); color: white; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; backdrop-filter: blur(4px);" onmouseover="this.style.background='rgba(220, 38, 38, 0.95)'; this.style.transform='scale(1.05)'" onmouseout="this.style.background='rgba(239, 68, 68, 0.9)'; this.style.transform='scale(1)'">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                </button>
                <button type="button" data-video-delete title="Delete Video" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: rgba(107, 114, 128, 0.9); color: white; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; backdrop-filter: blur(4px);" onmouseover="this.style.background='rgba(75, 85, 99, 0.95)'; this.style.transform='scale(1.05)'" onmouseout="this.style.background='rgba(107, 114, 128, 0.9)'; this.style.transform='scale(1)'" class="video-delete-btn">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
              </div>
            </div>
          </div>`;
        });
        
        // Migrate old images to new format with delete button
        bodyHtml = bodyHtml.replace(/<div contenteditable="false" style="margin: 16px auto; max-width: 640px;"><img src="([^"]+)" style="width: 100%; height: auto; border-radius: 12px; display: block;"><\/div>/gi, (match, imgSrc) => {
          return `<div contenteditable="false" style="margin: 16px auto; max-width: 640px; position: relative;" data-image-container>
            <div style="position: relative;">
              <img src="${imgSrc}" style="width: 100%; height: auto; border-radius: 12px; display: block;">
              <div contenteditable="false" style="position: absolute; top: 12px; left: 12px; z-index: 10;">
                <button type="button" data-image-delete contenteditable="false" title="Delete Image" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: rgba(107, 114, 128, 0.9); color: white; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; backdrop-filter: blur(4px);" onmouseover="this.style.background='rgba(75, 85, 99, 0.95)'; this.style.transform='scale(1.05)'" onmouseout="this.style.background='rgba(107, 114, 128, 0.9)'; this.style.transform='scale(1)'" class="image-delete-btn">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
              </div>
            </div>
          </div>`;
        });
        
        // Also migrate really old image format without max-width
        bodyHtml = bodyHtml.replace(/<div contenteditable="false" style="margin: 16px 0;"><img src="([^"]+)" style="max-width: 100%; height: auto; border-radius: 8px;"><\/div>/gi, (match, imgSrc) => {
          return `<div contenteditable="false" style="margin: 16px auto; max-width: 640px; position: relative;" data-image-container>
            <div style="position: relative;">
              <img src="${imgSrc}" style="width: 100%; height: auto; border-radius: 12px; display: block;">
              <div contenteditable="false" style="position: absolute; top: 12px; left: 12px; z-index: 10;">
                <button type="button" data-image-delete contenteditable="false" title="Delete Image" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: rgba(107, 114, 128, 0.9); color: white; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; backdrop-filter: blur(4px);" onmouseover="this.style.background='rgba(75, 85, 99, 0.95)'; this.style.transform='scale(1.05)'" onmouseout="this.style.background='rgba(107, 114, 128, 0.9)'; this.style.transform='scale(1)'" class="image-delete-btn">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
              </div>
            </div>
          </div>`;
        });
        
        // Catch-all: Migrate any remaining image in a div that doesn't have delete button
        // This will match any div with an img tag that doesn't already have data-image-delete
        bodyHtml = bodyHtml.replace(/<div([^>]*contenteditable="false"[^>]*)>(\s*)<img\s+src="([^"]+)"([^>]*)>(\s*)<\/div>/gi, (match, divAttrs, ws1, imgSrc, imgAttrs, ws2) => {
          // Skip if this div already has the delete button
          if (match.includes('data-image-delete') || match.includes('data-image-container')) {
            return match;
          }
          // Skip if this is a video container
          if (match.includes('data-video-type')) {
            return match;
          }
          return `<div contenteditable="false" style="margin: 16px auto; max-width: 640px; position: relative;" data-image-container>
            <div style="position: relative;">
              <img src="${imgSrc}" style="width: 100%; height: auto; border-radius: 12px; display: block;">
              <div contenteditable="false" style="position: absolute; top: 12px; left: 12px; z-index: 10;">
                <button type="button" data-image-delete contenteditable="false" title="Delete Image" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: rgba(107, 114, 128, 0.9); color: white; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; backdrop-filter: blur(4px);" onmouseover="this.style.background='rgba(75, 85, 99, 0.95)'; this.style.transform='scale(1.05)'" onmouseout="this.style.background='rgba(107, 114, 128, 0.9)'; this.style.transform='scale(1)'" class="image-delete-btn">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
              </div>
            </div>
          </div>`;
        });
        
        bodyInputRef.current.innerHTML = bodyHtml;
      }
    }
  }, [activePageId, selectedCourseId, props.courses]);

  // Add event delegation for video buttons (share and delete)
  useEffect(() => {
    const bodyElement = bodyInputRef.current;
    if (!bodyElement) return;
    
    const handleVideoButtonClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Check if click is on share button or its children
      const shareButton = target.closest('[data-video-share]');
      if (shareButton) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        const videoContainer = shareButton.closest('[data-video-type]');
        const shareUrl = videoContainer?.getAttribute('data-share-url');
        
        if (shareUrl) {
          try {
            await navigator.clipboard.writeText(shareUrl);
            
            // Show "Copied!" message
            const originalHTML = (shareButton as HTMLElement).innerHTML;
            (shareButton as HTMLElement).innerHTML = '<span style="font-size: 11px; font-weight: 600; white-space: nowrap;">Copied!</span>';
            (shareButton as HTMLElement).style.width = 'auto';
            (shareButton as HTMLElement).style.padding = '0 12px';
            
            setTimeout(() => {
              if (shareButton) {
                (shareButton as HTMLElement).innerHTML = originalHTML;
                (shareButton as HTMLElement).style.width = '40px';
                (shareButton as HTMLElement).style.padding = '';
              }
            }, 2000);
          } catch (err) {
            console.error('Failed to copy link:', err);
            alert('Failed to copy link. Please try again.');
          }
        }
        return false;
      }
      
      // Check if click is on video delete button or its children
      const deleteButton = target.closest('[data-video-delete]');
      if (deleteButton) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Show confirmation dialog
        const confirmed = window.confirm('Are you sure you want to delete this video?');
        if (!confirmed) {
          return false;
        }
        
        const videoContainer = deleteButton.closest('[data-video-type]');
        if (videoContainer && bodyInputRef.current) {
          const course = props.courses.find((c) => c.id === selectedCourseId);
          if (course) {
            videoContainer.remove();
            const nextBody = bodyInputRef.current.innerHTML;
            const nextPages = (course.pages || []).map((p) => (p.id === activePageId ? { ...p, body: nextBody } : p));
            updateCourse({ ...course, pages: nextPages });
          }
        }
        return false;
      }
      
      // Check if click is on image delete button or its children
      const imageDeleteButton = target.closest('[data-image-delete]');
      if (imageDeleteButton) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Show confirmation dialog
        const confirmed = window.confirm('Are you sure you want to delete this image?');
        if (!confirmed) {
          return false;
        }
        
        const imageContainer = imageDeleteButton.closest('[data-image-container]');
        if (imageContainer && bodyInputRef.current) {
          const course = props.courses.find((c) => c.id === selectedCourseId);
          if (course) {
            imageContainer.remove();
            const nextBody = bodyInputRef.current.innerHTML;
            const nextPages = (course.pages || []).map((p) => (p.id === activePageId ? { ...p, body: nextBody } : p));
            updateCourse({ ...course, pages: nextPages });
          }
        }
        return false;
      }
    };
    
    bodyElement.addEventListener('mousedown', handleVideoButtonClick, true);
    
    return () => {
      bodyElement.removeEventListener('mousedown', handleVideoButtonClick, true);
    };
  }, [activePageId, selectedCourseId, props.courses, updateCourse]);

  // Click outside handler to close all menus
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      
      // Check if click is outside menu triggers and menus
      const isMenuTrigger = target.closest('.course-page-menu-trigger') || 
                           target.closest('.course-folder-menu-trigger') ||
                           target.closest('.course-menu-trigger') ||
                           target.closest('.course-page-add-button');
      const isMenu = target.closest('.course-page-menu') || 
                    target.closest('.course-folder-menu') ||
                    target.closest('.course-menu') ||
                    target.closest('.course-page-add-menu');
      
      if (!isMenuTrigger && !isMenu) {
        setOpenPageMenuId(null);
        setOpenFolderMenuId(null);
        setIsCourseMenuOpen(false);
        setIsAddMenuOpen(false);
        setOpenResourceMenuId(null);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Auto-select first page when entering pages section
  useEffect(() => {
    if (detailSection === 'pages' && selectedCourse && selectedCourse.pages && selectedCourse.pages.length > 0 && !activePageId) {
      setActivePageId(selectedCourse.pages[0].id);
    }
  }, [detailSection, selectedCourse, activePageId]);

  function updateCourse(updated: Course) {
    if (isCreatingNewCourse) {
      setNewCourseData(updated);
    } else {
      const next = props.courses.map((course) => (course.id === updated.id ? updated : course));
      props.onCoursesChange(next);
    }
  }

  // Function to save lesson/quiz changes immediately — calls API directly
  async function saveLessonOrQuiz(type: 'lesson' | 'quiz') {
    if (!selectedCourse) return;
    
    setIsSavingLesson(true);
    setSavingMessage(type === 'quiz' ? 'Saving Quiz...' : 'Saving Lesson...');
    
    try {
      // Save only the changed course, not all courses
      const cleanedCourse = props.cleanCourses ? props.cleanCourses([selectedCourse])[0] : selectedCourse;
      
      const res = await fetch("/api/courses/bulk", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([cleanedCourse])
      });
      
      if (!res.ok) {
        throw new Error('Failed to save');
      }
      
      showToast(type === 'quiz' ? 'Quiz saved successfully!' : 'Lesson saved successfully!', 'success');
    } catch (error) {
      console.error('Save error:', error);
      showToast('Failed to save. Please try again.', 'error');
    } finally {
      setIsSavingLesson(false);
      setSavingMessage("");
    }
  }

  async function saveCourse() {
    setIsSavingCourse(true);
    try {
      if (isCreatingNewCourse && newCourseData) {
        // Save new course - only save the new course, not all courses
        const cleanedCourse = props.cleanCourses ? props.cleanCourses([newCourseData])[0] : newCourseData;
        
        const res = await fetch("/api/courses/bulk", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([cleanedCourse])
        });
        
        if (!res.ok) {
          throw new Error('Failed to save course');
        }
        
        setSelectedCourseId(newCourseData.id);
        setIsCreatingNewCourse(false);
        setNewCourseData(null);
        setOriginalCourse(JSON.parse(JSON.stringify(newCourseData)));
        setHasChanges(false);
        showToast('Course created successfully!', 'success');
      } else if (selectedCourse && hasChanges) {
        // Save only the changed course, not all courses
        const cleanedCourse = props.cleanCourses ? props.cleanCourses([selectedCourse])[0] : selectedCourse;
        
        const res = await fetch("/api/courses/bulk", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([cleanedCourse])
        });
        
        if (!res.ok) {
          throw new Error('Failed to save course');
        }
        
        setOriginalCourse(JSON.parse(JSON.stringify(selectedCourse)));
        setHasChanges(false);
        console.log('Course saved:', selectedCourse.title);
        showToast('Course saved successfully!', 'success');
      }
      setViewMode("grid");
    } catch (error) {
      console.error('Save error:', error);
      showToast('Failed to save course. Please try again.', 'error');
    } finally {
      setIsSavingCourse(false);
    }
  }

  function cancelChanges() {
    if (isCreatingNewCourse) {
      // Cancel new course creation
      setIsCreatingNewCourse(false);
      setNewCourseData(null);
      setHasChanges(false);
    } else if (originalCourse && hasChanges) {
      // Revert to original course
      const next = props.courses.map((course) => 
        course.id === originalCourse.id ? originalCourse : course
      );
      props.onCoursesChange(next);
      setHasChanges(false);
    }
    setViewMode("grid");
  }

  function getResourceIcon(url: string) {
    if (!url) return '🔗';
    const lower = url.toLowerCase();
    if (lower.includes('.mp4') || lower.includes('.mov') || lower.includes('.avi') || lower.includes('.webm') || lower.includes('youtube.com') || lower.includes('youtu.be') || lower.includes('vimeo.com')) {
      return '🎥';
    }
    if (lower.includes('.jpg') || lower.includes('.jpeg') || lower.includes('.png') || lower.includes('.gif') || lower.includes('.svg') || lower.includes('.webp')) {
      return '🖼️';
    }
    if (lower.includes('.pdf')) {
      return '📄';
    }
    if (lower.includes('.doc') || lower.includes('.docx') || lower.includes('.txt')) {
      return '📝';
    }
    if (lower.includes('.xls') || lower.includes('.xlsx') || lower.includes('.csv')) {
      return '📊';
    }
    if (lower.includes('.zip') || lower.includes('.rar') || lower.includes('.7z')) {
      return '📦';
    }
    return '🔗';
  }

  function createCourse() {
    const newCourse: Course = {
      id: `course-${Date.now()}`,
      title: "New Course",
      tagline: "",
      description: "",
      lessonNames: [],
      assetFiles: [],
      marketingDocs: [],
      icon: "📘",
      difficultyLabel: "Medium",
      timeLabel: "Medium",
      difficultyScore: 50,
      timeScore: 50,
      riskScore: 0,
      capitalScore: 0,
      personalityScore: 50,
      quizQuestions: [],
      links: [],
      status: "draft",
      coverImageUrl: "",
      accessMode: "open",
      pages: [
        {
          id: `page-${Date.now()}`,
          title: "New Lesson",
          status: "draft",
          body: "",
          videoUrl: "",
          transcript: "",
          pinnedCommunityPostUrl: "",
          resourceLinks: [],
          fileUrls: [],
          isQuiz: false,
          quizQuestions: []
        }
      ]
    };

    setNewCourseData(newCourse);
    setIsCreatingNewCourse(true);
    setSelectedCourseId(newCourse.id);
    setViewMode("detail");
    setDetailSection("overview");
    setHasChanges(true);
  }

  async function deleteCourse(id: string) {
    await props.onDeleteCourse(id);
    if (selectedCourseId === id) {
      const remaining = props.courses.filter(c => c.id !== id);
      setSelectedCourseId(remaining.length > 0 ? remaining[0].id : "");
    }
    setViewMode("grid");
  }

  function addPageForCourse(course: Course, folderId?: string, isQuiz?: boolean) {
    const pages = course.pages ?? [];
    // If a lesson/page is currently selected, drop the new page right after it
    // (inheriting its folder when none was explicitly passed). Otherwise append at the end.
    const selectedIndex = activePageId ? pages.findIndex((page) => page.id === activePageId) : -1;
    const selectedPage = selectedIndex >= 0 ? pages[selectedIndex] : undefined;
    const targetFolderId = folderId ?? selectedPage?.folderId;
    const newPage: CoursePage = {
      id: `page-${Date.now()}`,
      title: isQuiz ? "New quiz" : "New Lesson",
      status: "published",
      body: "",
      folderId: targetFolderId,
      videoUrl: "",
      resourceLinks: [],
      fileUrls: [],
      isQuiz: isQuiz || false,
      quizQuestions: isQuiz ? [{ id: `q-${Date.now()}`, prompt: "", options: ["", "", "", ""], correctIndex: 0 }] : []
    };
    // Only insert right after the selected lesson when it lives in the same folder as the new page.
    const insertAfterSelected = selectedPage !== undefined && selectedPage.folderId === targetFolderId;
    const nextPages = insertAfterSelected
      ? [...pages.slice(0, selectedIndex + 1), newPage, ...pages.slice(selectedIndex + 1)]
      : [...pages, newPage];
    const nextCourse: Course = {
      ...course,
      pages: nextPages
    };
    console.log("Adding page to course:", { courseId: course.id, newPage, totalPages: nextCourse.pages?.length || 0 });
    updateCourse(nextCourse);
    setDetailSection("pages");
    setActivePageId(newPage.id);
    setOpenPageMenuId(null);
    setIsCourseMenuOpen(false);
  }

  function movePageToFolder(pageId: string, targetFolderId?: string) {
    if (!selectedCourse) return;
    const pages = selectedCourse.pages ?? [];
    const nextPages = pages.map((page) => 
      page.id === pageId ? { ...page, folderId: targetFolderId } : page
    );
    updateCourse({ ...selectedCourse, pages: nextPages });
  }

  function reorderPages(draggedPageId: string, targetPageId: string, position: 'above' | 'below', targetFolderId?: string) {
    if (!selectedCourse) return;
    const pages = [...(selectedCourse.pages ?? [])];
    const draggedIndex = pages.findIndex(p => p.id === draggedPageId);
    const targetIndex = pages.findIndex(p => p.id === targetPageId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    const draggedPage = { ...pages[draggedIndex], folderId: targetFolderId };
    pages.splice(draggedIndex, 1);
    
    const newTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
    const insertIndex = position === 'above' ? newTargetIndex : newTargetIndex + 1;
    
    pages.splice(insertIndex, 0, draggedPage);
    updateCourse({ ...selectedCourse, pages });
  }

  function reorderFolders(draggedFolderId: string, targetFolderId: string, position: 'above' | 'below') {
    if (!selectedCourse) return;
    const folders = [...(selectedCourse.folders ?? [])];
    const draggedIndex = folders.findIndex(f => f.id === draggedFolderId);
    const targetIndex = folders.findIndex(f => f.id === targetFolderId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    const draggedFolder = folders[draggedIndex];
    folders.splice(draggedIndex, 1);
    
    const newTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
    const insertIndex = position === 'above' ? newTargetIndex : newTargetIndex + 1;
    
    folders.splice(insertIndex, 0, draggedFolder);
    updateCourse({ ...selectedCourse, folders });
  }

  function insertFolderAtPagePosition(draggedFolderId: string, targetPageId: string, position: 'above' | 'below') {
    if (!selectedCourse) return;
    const folders = [...(selectedCourse.folders ?? [])];
    const draggedFolderIndex = folders.findIndex(f => f.id === draggedFolderId);
    if (draggedFolderIndex === -1) return;
    
    const draggedFolder = folders[draggedFolderIndex];
    folders.splice(draggedFolderIndex, 1);
    
    // For simplicity, just move folder to end or beginning based on position
    if (position === 'above') {
      folders.unshift(draggedFolder);
    } else {
      folders.push(draggedFolder);
    }
    
    updateCourse({ ...selectedCourse, folders });
  }

  // Helper function to move page up within pages without folder
  function movePageUpInRoot(pageId: string) {
    if (!selectedCourse) return;
    const allPages = [...(selectedCourse.pages ?? [])];
    const pagesWithoutFolder = allPages.filter(p => !p.folderId);
    const page = allPages.find(p => p.id === pageId);
    if (!page) return;
    
    const indexInFiltered = pagesWithoutFolder.indexOf(page);
    if (indexInFiltered <= 0) return; // Already at top
    
    const currentIndex = allPages.indexOf(page);
    const targetPage = pagesWithoutFolder[indexInFiltered - 1];
    const targetIndex = allPages.indexOf(targetPage);
    
    // Remove from current position
    allPages.splice(currentIndex, 1);
    // Insert before target
    allPages.splice(targetIndex, 0, page);
    
    updateCourse({ ...selectedCourse, pages: allPages });
  }

  // Helper function to move page down within pages without folder
  function movePageDownInRoot(pageId: string) {
    if (!selectedCourse) return;
    const allPages = [...(selectedCourse.pages ?? [])];
    const pagesWithoutFolder = allPages.filter(p => !p.folderId);
    const page = allPages.find(p => p.id === pageId);
    if (!page) return;
    
    const indexInFiltered = pagesWithoutFolder.indexOf(page);
    if (indexInFiltered >= pagesWithoutFolder.length - 1) return; // Already at bottom
    
    const currentIndex = allPages.indexOf(page);
    const targetPage = pagesWithoutFolder[indexInFiltered + 1];
    const targetIndex = allPages.indexOf(targetPage);
    
    // Remove from current position
    allPages.splice(currentIndex, 1);
    // Insert after target
    allPages.splice(targetIndex, 0, page);
    
    updateCourse({ ...selectedCourse, pages: allPages });
  }

  // Helper function to move page up within a folder
  function movePageUpInFolder(pageId: string, folderId: string) {
    if (!selectedCourse) return;
    const allPages = [...(selectedCourse.pages ?? [])];
    const folderPages = allPages.filter(p => p.folderId === folderId);
    const page = allPages.find(p => p.id === pageId);
    if (!page) return;
    
    const indexInFolder = folderPages.indexOf(page);
    if (indexInFolder <= 0) return; // Already at top of folder
    
    const currentIndex = allPages.indexOf(page);
    const targetPage = folderPages[indexInFolder - 1];
    const targetIndex = allPages.indexOf(targetPage);
    
    // Remove from current position
    allPages.splice(currentIndex, 1);
    // Insert before target
    allPages.splice(targetIndex, 0, page);
    
    updateCourse({ ...selectedCourse, pages: allPages });
  }

  // Helper function to move page down within a folder
  function movePageDownInFolder(pageId: string, folderId: string) {
    if (!selectedCourse) return;
    const allPages = [...(selectedCourse.pages ?? [])];
    const folderPages = allPages.filter(p => p.folderId === folderId);
    const page = allPages.find(p => p.id === pageId);
    if (!page) return;
    
    const indexInFolder = folderPages.indexOf(page);
    if (indexInFolder >= folderPages.length - 1) return; // Already at bottom of folder
    
    const currentIndex = allPages.indexOf(page);
    const targetPage = folderPages[indexInFolder + 1];
    const targetIndex = allPages.indexOf(targetPage);
    
    // Remove from current position
    allPages.splice(currentIndex, 1);
    // Insert after target
    allPages.splice(targetIndex, 0, page);
    
    updateCourse({ ...selectedCourse, pages: allPages });
  }

  // Helper function to move folder up
  function moveFolderUp(folderId: string) {
    if (!selectedCourse) return;
    const folders = [...(selectedCourse.folders ?? [])];
    const folderIndex = folders.findIndex(f => f.id === folderId);
    if (folderIndex <= 0) return; // Already at top
    
    // Swap with previous folder
    [folders[folderIndex - 1], folders[folderIndex]] = [folders[folderIndex], folders[folderIndex - 1]];
    
    updateCourse({ ...selectedCourse, folders });
  }

  // Helper function to move folder down
  function moveFolderDown(folderId: string) {
    if (!selectedCourse) return;
    const folders = [...(selectedCourse.folders ?? [])];
    const folderIndex = folders.findIndex(f => f.id === folderId);
    if (folderIndex >= folders.length - 1) return; // Already at bottom
    
    // Swap with next folder
    [folders[folderIndex], folders[folderIndex + 1]] = [folders[folderIndex + 1], folders[folderIndex]];
    
    updateCourse({ ...selectedCourse, folders });
  }

  async function addFolderForCourse(course: Course) {
    const folders: CourseFolder[] = course.folders ?? [];
    const status: CourseFolder["status"] = newFolderPublished ? "published" : "draft";

    setIsSavingModule(true);

    let nextCourse: Course;
    if (editingFolderId) {
      const nextFolders = folders.map((folder) =>
        folder.id === editingFolderId
          ? { ...folder, title: newFolderName.trim() || "Untitled folder", status }
          : folder
      );
      nextCourse = { ...course, folders: nextFolders };
    } else {
      const newFolder: CourseFolder = { id: `folder-${Date.now()}`, title: newFolderName.trim() || "Untitled folder", status };
      nextCourse = { ...course, folders: [...folders, newFolder] };
    }

    // Update local state
    updateCourse(nextCourse);

    // Save to database immediately
    try {
      const cleanedCourse = props.cleanCourses ? props.cleanCourses([nextCourse])[0] : nextCourse;
      const res = await fetch("/api/courses/bulk", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([cleanedCourse])
      });
      
      if (!res.ok) {
        throw new Error('Failed to save module');
      }
      
      showToast(editingFolderId ? 'Module updated successfully!' : 'Module added successfully!', 'success');
    } catch (error) {
      console.error('Save error:', error);
      showToast('Failed to save module. Please try again.', 'error');
    } finally {
      setIsSavingModule(false);
    }

    setIsFolderModalOpen(false);
    setNewFolderName("");
    setNewFolderPublished(true);
    setEditingFolderId(null);
  }

  // Drag and drop handlers for course reordering
  const handleDragStart = (e: React.DragEvent, courseId: string) => {
    console.log('[COURSE DRAG] Starting drag for course:', courseId);
    setDraggedCourseId(courseId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', courseId);
  };

  const handleDragEnd = () => {
    console.log('[COURSE DRAG] Drag ended');
    setDraggedCourseId(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetCourseId: string) => {
    e.preventDefault();
    
    if (!draggedCourseId || draggedCourseId === targetCourseId) {
      setDraggedCourseId(null);
      return;
    }

    console.log('[DRAG] Starting reorder:', { draggedCourseId, targetCourseId });

    const courses = [...props.courses];
    const draggedIndex = courses.findIndex(c => c.id === draggedCourseId);
    const targetIndex = courses.findIndex(c => c.id === targetCourseId);

    console.log('[DRAG] Indices:', { draggedIndex, targetIndex });

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedCourseId(null);
      return;
    }

    // Remove dragged course and insert at target position
    const [draggedCourse] = courses.splice(draggedIndex, 1);
    courses.splice(targetIndex, 0, draggedCourse);

    // Assign order numbers to all courses
    const reorderedCourses = courses.map((course, index) => ({
      ...course,
      order: index
    }));

    console.log('[DRAG] New order:', reorderedCourses.map(c => ({ title: c.title, order: c.order })));

    props.onCoursesChange(reorderedCourses);
    setDraggedCourseId(null);
  };

  if (viewMode === "progress") {
    const course = props.courses.find(c => c.id === progressCourseId);
    // Count ALL published items (lessons + quizzes), matching the rest of the app.
    const publishedPages = (course?.pages || []).filter(p => p.status === 'published');
    const totalLessons = publishedPages.length;

    // Build per-user rows: all non-admin users
    const allRows = progressUsers
      .filter(u => u.role !== 'admin')
      .map(user => {
        const record = progressData.find((p: any) => p.userId === user.id);
        const completedSet = new Set(record?.completedPages || []);
        const quizResults = record?.quizResults || [];
        const completedLessons = publishedPages.filter((p: any) =>
          p.isQuiz
            ? isQuizResultPassing(quizResults.find((r: any) => r.pageId === p.id))
            : completedSet.has(p.id)
        ).length;
        const pct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
        // "Completed" = all lessons actually done — NOT the stale stored flag, so
        // a user at 10/11 shows their real % instead of a false "✓ Completed".
        const courseCompleted = totalLessons > 0 && completedLessons >= totalLessons;
        return { user, completedLessons, pct, courseCompleted };
      })
      .sort((a, b) => b.pct - a.pct);

    // Apply search + role filter
    const rows = allRows.filter(({ user }) => {
      const matchesName = user.name?.toLowerCase().includes(progressSearch.toLowerCase());
      const matchesRole = progressRoleFilter === 'all' || user.role === progressRoleFilter;
      return matchesName && matchesRole;
    });

    // Unique roles for the filter dropdown
    const availableRoles = Array.from(new Set(
      progressUsers.filter(u => u.role !== 'admin').map(u => u.role).filter(Boolean)
    )) as string[];

    return (
      <div className="admin-course-grid-page">
        <div className="panel-header">
          <div className="panel-header-row">
            <span>Course Progress — {course?.title}</span>
            <button type="button" className="btn-ghost btn-small" onClick={() => setViewMode("grid")}>
              ← Back to courses
            </button>
          </div>
        </div>
        <div className="panel-body">
          {/* Search + Role filter */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <input
              className="field-input"
              placeholder="Search by name..."
              value={progressSearch}
              onChange={e => setProgressSearch(e.target.value)}
              style={{ flex: 1, minWidth: 200 }}
            />
            <select
              className="field-input"
              value={progressRoleFilter}
              onChange={e => setProgressRoleFilter(e.target.value)}
              style={{ minWidth: 140 }}
            >
              <option value="all">All Roles</option>
              {availableRoles.map(role => (
                <option key={role} value={role} style={{ textTransform: 'capitalize' }}>
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: 16, color: '#6b7280', fontSize: 14 }}>
            {totalLessons} item{totalLessons !== 1 ? 's' : ''} (lessons + quizzes) · {rows.length}{rows.length !== allRows.length ? ` of ${allRows.length}` : ''} users
          </div>
          {isLoadingProgress ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>Loading...</div>
          ) : rows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
              {allRows.length === 0 ? 'No users found.' : 'No users match your search.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rows.map(({ user, completedLessons, pct, courseCompleted }) => (
                <div key={user.id} style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '14px 18px', background: '#fff',
                  border: '1px solid #e5e7eb', borderRadius: 10,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}>
                  {/* Avatar */}
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: '#e0e7ff', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontWeight: 700, color: '#4f46e5',
                    fontSize: 16, flexShrink: 0
                  }}>
                    {user.name?.charAt(0).toUpperCase() || '?'}
                  </div>
                  {/* Name + role */}
                  <div style={{ minWidth: 160, flexShrink: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>{user.name}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'capitalize' }}>{user.role}</div>
                  </div>
                  {/* Progress bar */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13, color: '#374151' }}>
                      <span>{completedLessons} / {totalLessons} items</span>
                      <span style={{ fontWeight: 600, color: courseCompleted ? '#10b981' : '#2563eb' }}>
                        {courseCompleted ? '✓ Completed' : `${pct}%`}
                      </span>
                    </div>
                    <div style={{ height: 8, borderRadius: 999, background: '#e5e7eb', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 999,
                        background: courseCompleted ? '#10b981' : '#22c55e',
                        width: `${pct}%`, transition: 'width 0.3s'
                      }} />
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

  if (viewMode === "grid") {
    return (
      <div className="admin-course-grid-page">
        <div className="panel-header">
          <div className="panel-header-row">
            <span>Courses</span>
          </div>
        </div>
        <div className="panel-body">
          {props.courses.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", padding: "40px" }}>
              <div className="panel-empty">No courses yet.</div>
              <button type="button" className="admin-course-card-new" style={{ width: "200px", height: "200px" }} onClick={() => { createCourse(); }}>
                <div className="admin-course-card-new-icon">+</div>
                <div>New course</div>
              </button>
            </div>
          ) : (
            <>
              <div className="training-card-grid">
                {visibleCourses.map((course) => (
                  <button
                    key={course.id}
                    type="button"
                    className="training-card admin-course-card"
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, course.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, course.id)}
                    onDragEnd={handleDragEnd}
                    style={{
                      opacity: draggedCourseId === course.id ? 0.5 : (course.status === "draft" ? 0.6 : 1),
                      cursor: 'move',
                      filter: course.status === "draft" ? 'grayscale(30%)' : 'none',
                      border: course.status === "draft" ? '2px dashed #d1d5db' : undefined
                    }}
                    onClick={() => {
                      setSelectedCourseId(course.id);
                      setViewMode("detail");
                      setDetailSection("overview");
                    }}
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
                        {course.tagline && <span className="training-card-chip">{course.tagline}</span>}
                        {course.status === "draft" && (
                          <span className="training-card-chip" style={{ backgroundColor: "#f59e0b", marginLeft: "8px" }}>
                            Draft
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="training-card-body">
                      <div className="training-card-title" style={{ color: course.status === "draft" ? "#9ca3af" : undefined }}>
                        {course.title}
                      </div>
                      {course.description && (
                        <div style={{ fontSize: "12px", color: course.status === "draft" ? "#d1d5db" : "#6b7280", marginTop: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {course.description.length > 50 ? course.description.substring(0, 50) + "..." : course.description}
                        </div>
                      )}
                      <button
                        type="button"
                        className="btn-secondary btn-small"
                        style={{ marginTop: 10, width: '100%', fontSize: 12 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setProgressCourseId(course.id);
                          setProgressData([]);
                          setProgressUsers([]);
                          setProgressSearch('');
                          setProgressRoleFilter('all');
                          setIsLoadingProgress(true);
                          setViewMode("progress");
                          // Load progress data
                          Promise.all([
                            fetch(`/api/admin/course-progress?courseId=${course.id}`).then(r => r.json()),
                            fetch(`/api/users`).then(r => r.json())
                          ]).then(([prog, users]) => {
                            setProgressData(prog);
                            setProgressUsers(users.filter((u: any) => !u.deleted));
                          }).catch(console.error)
                            .finally(() => setIsLoadingProgress(false));
                        }}
                      >
                        📊 Track Progress
                      </button>
                    </div>
                  </button>
                ))}
                <button type="button" className="admin-course-card-new" onClick={() => { createCourse(); }}>
                  <div className="admin-course-card-new-icon">+</div>
                  <div>New course</div>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-course-management">
      {toastMessage && (
        <Toast
          message={toastMessage}
          type={toastType}
          onClose={() => setToastMessage(null)}
        />
      )}
      {isDeleteModalOpen && selectedCourse && (
        <div className="overlay" style={{ zIndex: 9999 }}>
          <div className="dialog" style={{ maxWidth: 520 }}>

            {/* ── Step 1: Choose what to delete ── */}
            {deleteStep === 'choose' && (
              <>
                <div className="dialog-title" style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  Delete Content
                </div>
                <div style={{ padding: '16px 0' }}>
                  <p style={{ margin: '0 0 16px', fontSize: 14, color: '#374151' }}>What would you like to delete from <strong>{selectedCourse.title}</strong>?</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(['lesson', 'module', 'course'] as DeleteTarget[]).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setDeleteTarget(t);
                          setDeleteSelectedIds(new Set());
                          setDeleteStep(t === 'course' ? 'confirm' : 'select');
                        }}
                        style={{
                          padding: '14px 16px', border: '2px solid #e5e7eb', borderRadius: 8,
                          background: '#fff', cursor: 'pointer', textAlign: 'left',
                          fontSize: 14, fontWeight: 500, color: '#111827',
                          display: 'flex', alignItems: 'center', gap: 10
                        }}
                      >
                        <span style={{ fontSize: 20 }}>{t === 'lesson' ? '📄' : t === 'module' ? '📁' : '🗑️'}</span>
                        {t === 'lesson' ? 'Lesson / Quiz Pages' : t === 'module' ? 'Module (Folder)' : 'Entire Course'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="dialog-actions">
                  <button type="button" className="btn-secondary" onClick={closeDeleteModal}>Cancel</button>
                </div>
              </>
            )}

            {/* ── Step 2: Select items ── */}
            {deleteStep === 'select' && deleteTarget && (
              <>
                <div className="dialog-title" style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  Select {deleteTarget === 'lesson' ? 'Lessons / Quizzes' : 'Modules'} to Delete
                </div>
                <div style={{ padding: '16px 0' }}>
                  {(() => {
                    const listItems = deleteTarget === 'lesson'
                      ? (selectedCourse.pages ?? []).map(p => ({ id: p.id, label: `${p.isQuiz ? '📝' : '📄'} ${p.title}`, sub: p.folderId ? (selectedCourse.folders ?? []).find(f => f.id === p.folderId)?.title : undefined }))
                      : (selectedCourse.folders ?? []).map(f => {
                          const cnt = (selectedCourse.pages ?? []).filter(p => p.folderId === f.id).length;
                          return { id: f.id, label: `📁 ${f.title}`, sub: `${cnt} lesson${cnt !== 1 ? 's' : ''}` };
                        });
                    const allSelected = listItems.length > 0 && listItems.every(i => deleteSelectedIds.has(i.id));
                    return (
                      <>
                        {listItems.length === 0 ? (
                          <p style={{ color: '#6b7280', fontSize: 14 }}>No {deleteTarget === 'lesson' ? 'lessons' : 'modules'} found.</p>
                        ) : (
                          <>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #e5e7eb', marginBottom: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>
                              <input type="checkbox" checked={allSelected} onChange={() => {
                                if (allSelected) setDeleteSelectedIds(new Set());
                                else setDeleteSelectedIds(new Set(listItems.map(i => i.id)));
                              }} />
                              Select All
                            </label>
                            <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {listItems.map(item => (
                                <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, cursor: 'pointer', background: deleteSelectedIds.has(item.id) ? '#fef2f2' : '#f9fafb', border: `1px solid ${deleteSelectedIds.has(item.id) ? '#fecaca' : '#e5e7eb'}` }}>
                                  <input type="checkbox" checked={deleteSelectedIds.has(item.id)} onChange={() => {
                                    const next = new Set(deleteSelectedIds);
                                    if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                                    setDeleteSelectedIds(next);
                                  }} />
                                  <div>
                                    <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{item.label}</div>
                                    {item.sub && <div style={{ fontSize: 11, color: '#6b7280' }}>{item.sub}</div>}
                                  </div>
                                </label>
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>
                <div className="dialog-actions">
                  <button type="button" className="btn-secondary" onClick={() => setDeleteStep('choose')}>← Back</button>
                  <button
                    type="button"
                    className="btn-secondary btn-danger-solid"
                    disabled={deleteSelectedIds.size === 0}
                    onClick={() => setDeleteStep('confirm')}
                  >
                    Continue →
                  </button>
                </div>
              </>
            )}

            {/* ── Step 3: Final confirmation ── */}
            {deleteStep === 'confirm' && deleteTarget && (
              <>
                <div className="dialog-title" style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  Confirm Delete
                </div>
                <div style={{ padding: '16px 0' }}>
                  <p style={{ margin: '0 0 12px', fontSize: 14, color: '#374151', fontWeight: 500 }}>
                    Are you sure you want to delete {deleteTarget === 'course' ? 'this entire course' : deleteTarget === 'lesson' ? `${deleteSelectedIds.size} lesson${deleteSelectedIds.size !== 1 ? 's' : ''}` : `${deleteSelectedIds.size} module${deleteSelectedIds.size !== 1 ? 's' : ''}`}?
                  </p>
                  <div style={{ padding: 12, backgroundColor: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca', marginBottom: 12 }}>
                    {deleteTarget === 'course' ? (
                      <>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#991b1b', marginBottom: 4 }}>{selectedCourse.title}</div>
                        <div style={{ fontSize: 12, color: '#dc2626' }}>This will delete all {(selectedCourse.pages ?? []).length} lesson(s) and all associated content.</div>
                      </>
                    ) : deleteTarget === 'lesson' ? (
                      <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 13, color: '#991b1b' }}>
                        {(selectedCourse.pages ?? []).filter(p => deleteSelectedIds.has(p.id)).map(p => <li key={p.id}>{p.title}</li>)}
                      </ul>
                    ) : (
                      <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 13, color: '#991b1b' }}>
                        {(selectedCourse.folders ?? []).filter(f => deleteSelectedIds.has(f.id)).map(f => <li key={f.id}>{f.title}</li>)}
                      </ul>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>⚠️ This action cannot be undone.</p>
                </div>
                <div className="dialog-actions">
                  <button type="button" className="btn-secondary" onClick={deleteTarget === 'course' ? closeDeleteModal : () => setDeleteStep('select')}>Cancel</button>
                  <button type="button" className="btn-secondary btn-danger-solid" onClick={confirmDelete}>
                    Confirm Delete
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}
      {isFolderModalOpen && selectedCourse && (
        <div className="overlay" style={{ zIndex: 9998 }}>
          <div className="dialog">
            <div className="dialog-title">{editingFolderId ? "Edit Module  " : "Add Module  "}</div>
            <label className="field">
              <span className="field-label">Name</span>
              <input 
                className="field-input" 
                value={newFolderName} 
                maxLength={50} 
                onChange={(event) => setNewFolderName(event.target.value)} 
                disabled={isSavingModule}
              />
              <div className="field-helper">{newFolderName.length} / 50</div>
            </label>
            <div className="dialog-footer">
              <button
                type="button"
                className={newFolderPublished ? "status-toggle status-toggle-on dialog-publish-toggle" : "status-toggle dialog-publish-toggle"}
                onClick={() => setNewFolderPublished(!newFolderPublished)}
                disabled={isSavingModule}
              >
                <span className={newFolderPublished ? "status-toggle-label status-toggle-label-on" : "status-toggle-label"}>Published</span>
                <span className="status-toggle-track">
                  <span className="status-toggle-thumb" />
                </span>
              </button>
              <div className="dialog-actions">
                <button
                  type="button"
                  className="btn-secondary btn-cancel"
                  onClick={() => {
                    setIsFolderModalOpen(false);
                    setNewFolderName("");
                    setNewFolderPublished(true);
                    setEditingFolderId(null);
                  }}
                  disabled={isSavingModule}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="btn-primary btn-success" 
                  disabled={!newFolderName.trim() || isSavingModule} 
                  onClick={() => addFolderForCourse(selectedCourse)}
                  style={isSavingModule ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
                >
                  {isSavingModule ? 'Saving...' : (editingFolderId ? "Save" : "Add")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {isSavingModule && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: "14px", padding: "32px 40px", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontWeight: 700, fontSize: "16px", color: "#1f2937", marginBottom: "6px" }}>Saving module...</div>
            <div style={{ fontSize: "13px", color: "#6b7280" }}>Please wait, do not close this page</div>
            <div style={{ marginTop: "16px", display: "flex", justifyContent: "center" }}>
              <div style={{ width: 32, height: 32, border: "3px solid #e5e7eb", borderTop: "3px solid #1f2937", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            </div>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      {isChangeModuleModalOpen && selectedCourse && (
        <div className="overlay">
          <div className="dialog">
            <div className="dialog-title">Change Module</div>
            <label className="field">
              <span className="field-label">Select Module</span>
              <select 
                className="field-input" 
                value={selectedModuleId || "none"} 
                onChange={(e) => setSelectedModuleId(e.target.value === "none" ? undefined : e.target.value)}
              >
                <option value="none">No Module (Course Root)</option>
                {(selectedCourse.folders || []).map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="dialog-footer">
              <div />
              <div className="dialog-actions">
                <button
                  type="button"
                  className="btn-secondary btn-cancel"
                  onClick={() => {
                    setIsChangeModuleModalOpen(false);
                    setChangeModulePageId(null);
                    setSelectedModuleId(undefined);
                  }}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="btn-primary btn-success" 
                  onClick={() => {
                    if (changeModulePageId) {
                      const pages = selectedCourse.pages || [];
                      const nextPages = pages.map((page) => 
                        page.id === changeModulePageId 
                          ? { ...page, folderId: selectedModuleId } 
                          : page
                      );
                      updateCourse({ ...selectedCourse, pages: nextPages });
                      setIsChangeModuleModalOpen(false);
                      setChangeModulePageId(null);
                      setSelectedModuleId(undefined);
                    }
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {isImageModalOpen && selectedCourse && (() => {
        const course = selectedCourse as Course;
        const pages = course.pages ?? [];
        const activePage =
          (activePageId ? pages.find((page) => page.id === activePageId) : undefined) ??
          (pages.length > 0 ? pages[pages.length - 1] : undefined) ??
          undefined;
        if (!activePage) {
          return null;
        }
        const pageForImage = activePage as CoursePage;
        function handleAddImage() {
          const trimmed = imageUrlDraft.trim();
          if (!trimmed) {
            return;
          }
          
          const imageHtml = `<div contenteditable="false" style="margin: 16px auto; max-width: 640px; position: relative;" data-image-container>
            <div style="position: relative;">
              <img src="${trimmed}" style="width: 100%; height: auto; border-radius: 12px; display: block;">
              <div contenteditable="false" style="position: absolute; top: 12px; left: 12px; z-index: 10;">
                <button type="button" data-image-delete contenteditable="false" title="Delete Image" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: rgba(107, 114, 128, 0.9); color: white; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; backdrop-filter: blur(4px);" onmouseover="this.style.background='rgba(75, 85, 99, 0.95)'; this.style.transform='scale(1.05)'" onmouseout="this.style.background='rgba(107, 114, 128, 0.9)'; this.style.transform='scale(1)'" class="image-delete-btn">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
              </div>
            </div>
          </div>`;
          
          if (bodyInputRef.current && imageHtml) {
            bodyInputRef.current.focus();
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
              const range = selection.getRangeAt(0);
              range.deleteContents();
              const tempDiv = document.createElement("div");
              tempDiv.innerHTML = imageHtml + '<p><br></p>';
              const imageNode = tempDiv.firstChild!;
              const lineBreak = tempDiv.lastChild!;
              range.insertNode(lineBreak);
              range.insertNode(imageNode);
              
              const newRange = document.createRange();
              newRange.setStartAfter(lineBreak);
              newRange.collapse(true);
              selection.removeAllRanges();
              selection.addRange(newRange);
            } else {
              bodyInputRef.current.innerHTML += imageHtml + '<p><br></p>';
            }
            
            // Wait longer to ensure DOM is updated
            setTimeout(() => {
              if (bodyInputRef.current) {
                const nextBody = bodyInputRef.current.innerHTML;
                console.log('[Image] Saving body:', {
                  bodyLength: nextBody.length,
                  hasImage: nextBody.includes('<img'),
                  imageUrl: trimmed,
                  bodyPreview: nextBody.substring(0, 200)
                });
                // ALSO save to fileUrls array for marketing materials sync
                const existingFiles = pageForImage.fileUrls || [];
                const fileName = trimmed.split('/').pop() || 'Image';
                const nextPages = pages.map((page) => 
                  page.id === pageForImage.id 
                    ? { ...page, body: nextBody, fileUrls: [...existingFiles, { label: fileName, href: trimmed }] } 
                    : page
                );
                updateCourse({ ...(course as Course), pages: nextPages });
              }
            }, 100); // Increased timeout
          }
          
          setIsImageModalOpen(false);
          setImageUrlDraft("");
        }
        return (
          <div className="overlay">
            <div className="dialog">
              <div className="dialog-title">Add an image</div>
              <label className="field">
                <span className="field-label">Image URL</span>
                <input className="field-input" value={imageUrlDraft} onChange={(event) => setImageUrlDraft(event.target.value)} placeholder="https://" />
              </label>
              <div className="video-dropzone" onClick={() => imageFileInputRef.current?.click()}>
                <div className="video-dropzone-icon">⬆</div>
                <div className="video-dropzone-text-main">Drag and drop image here</div>
                <div className="video-dropzone-text-sub">or select file</div>
              </div>
              <input
                ref={imageFileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  
                  // Upload to server instead of base64
                  const formData = new FormData();
                  formData.append('file', file);
                  
                  try {
                    const response = await fetch('/api/upload-image', {
                      method: 'POST',
                      body: formData
                    });
                    
                    if (response.ok) {
                      const data = await response.json();
                      setImageUrlDraft(data.url); // This will be /uploads/filename.jpg
                    } else {
                      alert('Failed to upload image');
                    }
                  } catch (error) {
                    console.error('Upload error:', error);
                    alert('Failed to upload image');
                  }
                }}
              />
              <div className="dialog-footer">
                <div />
                <div className="dialog-actions">
                  <button type="button" className="btn-secondary btn-cancel" onClick={() => setIsImageModalOpen(false)}>
                    CANCEL
                  </button>
                  <button type="button" className="btn-primary btn-success" disabled={!imageUrlDraft.trim()} onClick={handleAddImage}>
                    ADD
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {isLinkModalOpen && selectedCourse && (() => {
        const course = selectedCourse as Course;
        const pages = course.pages ?? [];
        const activePage =
          (activePageId ? pages.find((page) => page.id === activePageId) : undefined) ??
          (pages.length > 0 ? pages[pages.length - 1] : undefined) ??
          undefined;
        if (!activePage) {
          return null;
        }
        const pageForLink = activePage as CoursePage;
        function handleAddLink() {
          const label = linkLabelDraft.trim();
          const href = linkUrlDraft.trim();
          if (!label || !href) {
            return;
          }
          
          // Check if we're editing an existing resource
          if (editingResourceIndex !== null && editingResourceType === 'link') {
            // Update existing resource
            const links = [...(pageForLink.resourceLinks || [])];
            links[editingResourceIndex] = { label, href };
            const nextPages = pages.map((page) => 
              page.id === pageForLink.id 
                ? { ...page, resourceLinks: links } 
                : page
            );
            updateCourse({ ...(course as Course), pages: nextPages });
            setEditingResourceIndex(null);
            setEditingResourceType(null);
          } else {
            // Add new resource to resourceLinks array only
            const existingLinks = pageForLink.resourceLinks || [];
            const nextPages = pages.map((page) => 
              page.id === pageForLink.id 
                ? { ...page, resourceLinks: [...existingLinks, { label, href }] } 
                : page
            );
            updateCourse({ ...(course as Course), pages: nextPages });
          }
          
          setIsLinkModalOpen(false);
          setLinkLabelDraft("");
          setLinkUrlDraft("");
        }
        return (
          <div className="overlay">
            <div className="dialog">
              <div className="dialog-title">Add link</div>
              <label className="field">
                <span className="field-label">Label</span>
                <input className="field-input" value={linkLabelDraft} maxLength={34} onChange={(event) => setLinkLabelDraft(event.target.value)} placeholder="Label" />
              </label>
              <label className="field" style={{ marginTop: 12 }}>
                <span className="field-label">URL</span>
                <input className="field-input" value={linkUrlDraft} onChange={(event) => setLinkUrlDraft(event.target.value)} placeholder="https://" />
              </label>
              <div className="dialog-footer">
                <div />
                <div className="dialog-actions">
                  <button type="button" className="btn-secondary btn-cancel" onClick={() => setIsLinkModalOpen(false)}>
                    CANCEL
                  </button>
                  <button type="button" className="btn-primary btn-success" disabled={!linkLabelDraft.trim() || !linkUrlDraft.trim()} onClick={handleAddLink}>
                    ADD
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {isResourceFileModalOpen && selectedCourse && (() => {
        const course = selectedCourse as Course;
        const pages = course.pages ?? [];
        const activePage =
          (activePageId ? pages.find((page) => page.id === activePageId) : undefined) ??
          (pages.length > 0 ? pages[pages.length - 1] : undefined) ??
          undefined;
        if (!activePage) {
          return null;
        }
        const pageForFile = activePage as CoursePage;
        function handleAddResourceFile() {
          const label = resourceFileLabelDraft.trim();
          const href = resourceFileUrlDraft.trim();
          if (!label || !href) {
            return;
          }
          
          // Check if we're editing an existing resource file
          if (editingResourceIndex !== null && editingResourceType === 'file') {
            // Update existing file
            const files = [...(pageForFile.fileUrls || [])];
            files[editingResourceIndex] = { label, href };
            const nextPages = pages.map((page) => 
              page.id === pageForFile.id 
                ? { ...page, fileUrls: files } 
                : page
            );
            updateCourse({ ...(course as Course), pages: nextPages });
            setEditingResourceIndex(null);
            setEditingResourceType(null);
          } else {
            // Add to fileUrls array only
            const existingFiles = pageForFile.fileUrls || [];
            const nextPages = pages.map((page) => 
              page.id === pageForFile.id 
                ? { ...page, fileUrls: [...existingFiles, { label, href }] } 
                : page
            );
            updateCourse({ ...(course as Course), pages: nextPages });
          }
          
          setIsResourceFileModalOpen(false);
          setResourceFileUrlDraft("");
          setResourceFileLabelDraft("");
        }
        return (
          <div className="overlay">
            <div className="dialog">
              <div className="dialog-title">Add resource file</div>
              <label className="field">
                <span className="field-label">Label</span>
                <input className="field-input" value={resourceFileLabelDraft} maxLength={50} onChange={(event) => setResourceFileLabelDraft(event.target.value)} placeholder="e.g., Download PDF, View Document" />
              </label>
              <label className="field" style={{ marginTop: 12 }}>
                <span className="field-label">File URL</span>
                <input className="field-input" value={resourceFileUrlDraft} onChange={(event) => setResourceFileUrlDraft(event.target.value)} placeholder="https://" />
              </label>
              <div className="video-dropzone" onClick={() => resourceFileInputRef.current?.click()}>
                <div className="video-dropzone-icon">⬆</div>
                <div className="video-dropzone-text-main">Drag and drop file here</div>
                <div className="video-dropzone-text-sub">or select file</div>
              </div>
              <input
                ref={resourceFileInputRef}
                type="file"
                style={{ display: "none" }}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  
                  // Auto-fill label with filename if empty
                  if (!resourceFileLabelDraft.trim()) {
                    setResourceFileLabelDraft(file.name);
                  }
                  
                  const formData = new FormData();
                  formData.append('file', file);
                  
                  try {
                    const response = await fetch('/api/upload-image', {
                      method: 'POST',
                      body: formData
                    });
                    
                    if (response.ok) {
                      const data = await response.json();
                      setResourceFileUrlDraft(data.url);
                    } else {
                      alert('Failed to upload file');
                    }
                  } catch (error) {
                    console.error('Upload error:', error);
                    alert('Failed to upload file');
                  }
                }}
              />
              <div className="dialog-footer">
                <div />
                <div className="dialog-actions">
                  <button type="button" className="btn-secondary btn-cancel" onClick={() => setIsResourceFileModalOpen(false)}>
                    CANCEL
                  </button>
                  <button type="button" className="btn-primary btn-success" disabled={!resourceFileLabelDraft.trim() || !resourceFileUrlDraft.trim()} onClick={handleAddResourceFile}>
                    ADD
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {isPinPostModalOpen && selectedCourse && (() => {
        const course = selectedCourse as Course;
        const pages = course.pages ?? [];
        const activePage =
          (activePageId ? pages.find((page) => page.id === activePageId) : undefined) ??
          (pages.length > 0 ? pages[pages.length - 1] : undefined) ??
          undefined;
        if (!activePage) {
          return null;
        }
        const pageForPost = activePage as CoursePage;
        function handlePinPost() {
          const trimmed = pinPostUrlDraft.trim();
          if (!trimmed) {
            return;
          }
          
          const nextPages = pages.map((page) => 
            page.id === pageForPost.id 
              ? { ...page, pinnedCommunityPostUrl: trimmed } 
              : page
          );
          updateCourse({ ...(course as Course), pages: nextPages });
          
          setIsPinPostModalOpen(false);
          setPinPostUrlDraft("");
        }
        return (
          <div className="overlay">
            <div className="dialog">
              <div className="dialog-title">Pin community post</div>
              <label className="field">
                <span className="field-label">Community Post URL</span>
                <input className="field-input" value={pinPostUrlDraft} onChange={(event) => setPinPostUrlDraft(event.target.value)} placeholder="https://" />
              </label>
              <div className="dialog-footer">
                <div />
                <div className="dialog-actions">
                  <button type="button" className="btn-secondary btn-cancel" onClick={() => setIsPinPostModalOpen(false)}>
                    CANCEL
                  </button>
                  <button type="button" className="btn-primary btn-success" disabled={!pinPostUrlDraft.trim()} onClick={handlePinPost}>
                    PIN
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {isVideoModalOpen && selectedCourse && (() => {
        const course = selectedCourse as Course;
        const pages = course.pages ?? [];
        const activePage =
          (activePageId ? pages.find((page) => page.id === activePageId) : undefined) ??
          (pages.length > 0 ? pages[pages.length - 1] : undefined) ??
          undefined;
        if (!activePage) {
          return null;
        }
        const pageForVideo = activePage as CoursePage;
        function handleAddVideo() {
          const trimmed = videoUrlDraft.trim();
          if (!trimmed) {
            return;
          }
          
          const isYouTube = trimmed.includes("youtube.com") || trimmed.includes("youtu.be");
          const isVimeo = trimmed.includes("vimeo.com");
          const isUploadedFile = trimmed.startsWith("/uploads/");
          let videoHtml = "";
          
          if (isYouTube) {
            const match = trimmed.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/);
            const videoId = match ? match[1] : "";
            if (videoId) {
              const shareUrl = `https://www.youtube.com/watch?v=${videoId}`;
              videoHtml = `<div contenteditable="false" style="margin: 16px auto; max-width: 640px; position: relative;" data-video-type="youtube" data-video-id="${videoId}" data-share-url="${shareUrl}">
                <div style="position: relative; aspect-ratio: 16/9; background: #000; border-radius: 12px; overflow: hidden;">
                  <iframe src="https://www.youtube.com/embed/${videoId}" loading="lazy" style="width: 100%; height: 100%; border: none;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"></iframe>
                  <div contenteditable="false" style="position: absolute; top: 12px; left: 12px; display: flex; gap: 8px; z-index: 10;">
                    <button type="button" data-video-share contenteditable="false" title="Copy Link" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: rgba(239, 68, 68, 0.9); color: white; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; backdrop-filter: blur(4px);" onmouseover="this.style.background='rgba(220, 38, 38, 0.95)'; this.style.transform='scale(1.05)'" onmouseout="this.style.background='rgba(239, 68, 68, 0.9)'; this.style.transform='scale(1)'">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                    </button>
                    <button type="button" data-video-delete contenteditable="false" title="Delete Video" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: rgba(107, 114, 128, 0.9); color: white; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; backdrop-filter: blur(4px);" onmouseover="this.style.background='rgba(75, 85, 99, 0.95)'; this.style.transform='scale(1.05)'" onmouseout="this.style.background='rgba(107, 114, 128, 0.9)'; this.style.transform='scale(1)'" class="video-delete-btn">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                  </div>
                </div>
              </div>`;
            }
          } else if (isVimeo) {
            // Extract Vimeo video ID from various URL formats
            // Supports: vimeo.com/123456789, vimeo.com/123456789/hash, player.vimeo.com/video/123456789
            const vimeoMatch = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/([a-zA-Z0-9]+))?/);
            console.log('Vimeo URL:', trimmed, 'Match:', vimeoMatch);
            if (vimeoMatch) {
              const videoId = vimeoMatch[1];
              const hash = vimeoMatch[2];
              const embedUrl = hash ? `https://player.vimeo.com/video/${videoId}?h=${hash}` : `https://player.vimeo.com/video/${videoId}`;
              const shareUrl = hash ? `https://vimeo.com/${videoId}/${hash}` : `https://vimeo.com/${videoId}`;
              console.log('Vimeo embed URL:', embedUrl);
              videoHtml = `<div contenteditable="false" style="margin: 16px auto; max-width: 640px; position: relative;" data-video-type="vimeo" data-video-id="${videoId}" data-share-url="${shareUrl}">
                <div style="position: relative; aspect-ratio: 16/9; background: #000; border-radius: 12px; overflow: hidden;">
                  <iframe src="${embedUrl}" loading="lazy" style="width: 100%; height: 100%; border: none;" allow="autoplay; fullscreen; picture-in-picture"></iframe>
                  <div contenteditable="false" style="position: absolute; top: 12px; left: 12px; display: flex; gap: 8px; z-index: 10;">
                    <button type="button" data-video-share contenteditable="false" title="Copy Link" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: rgba(239, 68, 68, 0.9); color: white; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; backdrop-filter: blur(4px);" onmouseover="this.style.background='rgba(220, 38, 38, 0.95)'; this.style.transform='scale(1.05)'" onmouseout="this.style.background='rgba(239, 68, 68, 0.9)'; this.style.transform='scale(1)'">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                    </button>
                    <button type="button" data-video-delete contenteditable="false" title="Delete Video" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: rgba(107, 114, 128, 0.9); color: white; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; backdrop-filter: blur(4px);" onmouseover="this.style.background='rgba(75, 85, 99, 0.95)'; this.style.transform='scale(1.05)'" onmouseout="this.style.background='rgba(107, 114, 128, 0.9)'; this.style.transform='scale(1)'" class="video-delete-btn">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                  </div>
                </div>
              </div>`;
            }
          } else if (isUploadedFile) {
            // Uploaded file from /uploads/ folder
            videoHtml = `<div contenteditable="false" style="margin: 16px auto; max-width: 640px; aspect-ratio: 16/9; background: #000; border-radius: 12px; overflow: hidden;"><video controls src="${trimmed}" style="width: 100%; height: 100%; object-fit: contain;"></video></div>`;
          } else {
            // External URL
            videoHtml = `<div contenteditable="false" style="margin: 16px auto; max-width: 640px; aspect-ratio: 16/9; background: #000; border-radius: 12px; overflow: hidden;"><video controls src="${trimmed}" style="width: 100%; height: 100%; object-fit: contain;"></video></div>`;
          }
          
          if (bodyInputRef.current && videoHtml) {
            bodyInputRef.current.focus();
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
              const range = selection.getRangeAt(0);
              range.deleteContents();
              const tempDiv = document.createElement("div");
              tempDiv.innerHTML = videoHtml + '<p><br></p>';
              const videoNode = tempDiv.firstChild!;
              const lineBreak = tempDiv.lastChild!;
              range.insertNode(lineBreak);
              range.insertNode(videoNode);
              
              const newRange = document.createRange();
              newRange.setStartAfter(lineBreak);
              newRange.collapse(true);
              selection.removeAllRanges();
              selection.addRange(newRange);
            } else {
              bodyInputRef.current.innerHTML += videoHtml + '<p><br></p>';
            }
            
            // Wait longer to ensure DOM is updated
            setTimeout(() => {
              if (bodyInputRef.current) {
                const nextBody = bodyInputRef.current.innerHTML;
                console.log('[Video] Saving body:', {
                  bodyLength: nextBody.length,
                  hasVideo: nextBody.includes('<video') || nextBody.includes('<iframe'),
                  videoUrl: trimmed,
                  bodyPreview: nextBody.substring(0, 200)
                });
                // ALSO save to videoUrl field for marketing materials sync
                const nextPages = pages.map((page) => 
                  page.id === pageForVideo.id 
                    ? { ...page, body: nextBody, videoUrl: trimmed } 
                    : page
                );
                updateCourse({ ...(course as Course), pages: nextPages });
              }
            }, 100); // Increased timeout
          }
          
          setIsVideoModalOpen(false);
          setVideoUrlDraft("");
        }
        return (
          <div className="overlay">
            <div className="dialog">
              <div className="dialog-title">Add a video</div>
              <label className="field">
                <span className="field-label">YouTube, Loom, Vimeo, or Wistia link</span>
                <input className="field-input" value={videoUrlDraft} onChange={(event) => setVideoUrlDraft(event.target.value)} placeholder="https://" />
              </label>
              <div className="video-dropzone" onClick={() => videoFileInputRef.current?.click()}>
                <div className="video-dropzone-icon">⬆</div>
                <div className="video-dropzone-text-main">Drag and drop video here</div>
                <div className="video-dropzone-text-sub">or select file</div>
              </div>
              <input
                ref={videoFileInputRef}
                type="file"
                accept="video/*"
                style={{ display: "none" }}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  
                  // Upload to server instead of base64
                  const formData = new FormData();
                  formData.append('file', file);
                  
                  try {
                    const response = await fetch('/api/upload-image', {
                      method: 'POST',
                      body: formData
                    });
                    
                    if (response.ok) {
                      const data = await response.json();
                      setVideoUrlDraft(data.url); // This will be /uploads/filename.mp4
                    } else {
                      alert('Failed to upload video');
                    }
                  } catch (error) {
                    console.error('Upload error:', error);
                    alert('Failed to upload video');
                  }
                }}
              />
              <div className="dialog-footer">
                <div />
                <div className="dialog-actions">
                  <button type="button" className="btn-secondary btn-cancel" onClick={() => setIsVideoModalOpen(false)}>
                    CANCEL
                  </button>
                  <button type="button" className="btn-primary btn-success" disabled={!videoUrlDraft.trim()} onClick={handleAddVideo}>
                    ADD
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      <div className="panel panel-right">
        {selectedCourse ? (
          <div className="panel-scroll">
            <div className="panel-header">
              <div className="panel-header-row">
                <span>Course Details</span>
                <div className="panel-header-actions">
                  <button type="button" className="btn-ghost btn-small" onClick={() => setViewMode("grid")}>
                    Back to courses
                  </button>
                  <button type="button" className="btn-ghost btn-danger" onClick={() => openDeleteModal()}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
            <div className="panel-body">
              {detailSection === "overview" ? (
                <>
                  <label className="field">
                    <span className="field-label">Course Title</span>
                    <input
                      className="field-input"
                      value={selectedCourse.title}
                      onChange={(e) => updateCourse({ ...selectedCourse, title: e.target.value })}
                    />
                  </label>
                  <div className="course-cover-editor">
                    <div
                      className="course-cover-preview"
                      style={selectedCourse.coverImageUrl ? { backgroundImage: `url(${selectedCourse.coverImageUrl})` } : undefined}
                    >
                      {!selectedCourse.coverImageUrl && (
                        <button type="button" className="course-cover-upload-button" onClick={() => fileInputRef.current?.click()}>
                          Upload
                        </button>
                      )}
                    </div>
                    <div className="course-cover-meta">
                      <div className="course-cover-meta-title">Cover</div>
                      <div className="course-cover-meta-subtitle">1460 x 752 px</div>
                      {selectedCourse.coverImageUrl && (
                        <button type="button" className="btn-secondary btn-small course-cover-change-button" onClick={() => fileInputRef.current?.click()}>
                          Change
                        </button>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          updateCourse({ ...selectedCourse, coverImageUrl: reader.result as string });
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </div>
                  <label className="field course-description-field">
                    <span className="field-label">Description</span>
                    <textarea
                      className="field-input"
                      rows={6}
                      value={selectedCourse.description}
                      onChange={(e) => updateCourse({ ...selectedCourse, description: e.target.value })}
                    />
                  </label>
                  <div className="form-grid">
                    <label className="field field-course-status">
                      <span className="field-label">Course Status</span>
                      <button
                        type="button"
                        className={selectedCourse.status === "published" ? "status-toggle status-toggle-on" : "status-toggle"}
                        onClick={async () => {
                          const newStatus: "draft" | "published" = (selectedCourse.status ?? "draft") === "published" ? "draft" : "published";
                          const updatedCourse = { ...selectedCourse, status: newStatus };
                          updateCourse(updatedCourse);
                          
                          // Save immediately with only this course
                          try {
                            const cleanedCourse = props.cleanCourses ? props.cleanCourses([updatedCourse])[0] : updatedCourse;
                            const res = await fetch("/api/courses/bulk", {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify([cleanedCourse])
                            });
                            if (!res.ok) throw new Error('Failed to save status');
                            showToast(`Course ${newStatus === 'published' ? 'published' : 'unpublished'} successfully!`, 'success');
                          } catch (error) {
                            console.error('Status save error:', error);
                            showToast('Failed to save status. Please try again.', 'error');
                          }
                        }}
                      >
                        <span className={selectedCourse.status === "published" ? "status-toggle-label status-toggle-label-on" : "status-toggle-label"}>
                          {selectedCourse.status === "published" ? "Published" : "Draft"}
                        </span>
                        <span className="status-toggle-track">
                          <span className="status-toggle-thumb" />
                        </span>
                      </button>
                    </label>
                    <label className="field">
                      <span className="field-label">Access</span>
                      <select
                        className="field-input"
                        value={selectedCourse.accessMode ?? "open"}
                        onChange={(e) => updateCourse({ ...selectedCourse, accessMode: e.target.value as "open" | "assigned" })}
                      >
                        <option value="open">Open to all members</option>
                        <option value="assigned">Assigned only (manager controls access)</option>
                      </select>
                    </label>
                  </div>
                  <div className="course-actions">
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" className="btn-secondary btn-cancel" onClick={cancelChanges} disabled={isSavingCourse}>
                        Cancel
                      </button>
                      <button 
                        type="button" 
                        className="btn-primary btn-success" 
                        onClick={saveCourse}
                        disabled={!hasChanges || isSavingCourse}
                        style={(!hasChanges || isSavingCourse) ? { opacity: 0.5, cursor: "not-allowed" } : {}}
                      >
                        {isSavingCourse ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                    <button type="button" className="btn-primary btn-success" onClick={() => {
                      setDetailSection("pages");
                      // Set first page as active if no page is selected
                      if (!activePageId && selectedCourse.pages && selectedCourse.pages.length > 0) {
                        setActivePageId(selectedCourse.pages[0].id);
                      }
                    }}>
                      Go to Modules
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="course-pages-layout">
                    {(!selectedCourse.pages || selectedCourse.pages.length === 0) &&
                    (!selectedCourse.folders || selectedCourse.folders.length === 0) ? (
                      <div className="panel-empty">No Lessons yet.</div>
                    ) : (
                      <>
                        {(() => {
                          const pages = selectedCourse.pages ?? [];
                          const folders = selectedCourse.folders ?? [];
                          const activePage = pages.find((page) => page.id === activePageId) ?? pages[pages.length - 1] ?? pages[0];

                          // ---- Import Quiz (scoped to THIS quiz page) ----
                          function previewQuizImport() {
                            try {
                              const parsed = parseQuestionsDoc(importDocText);
                              const errs = validateQuestions(parsed);
                              if (errs.length) {
                                setImportError(errs.join("\n"));
                                setImportReport(null);
                                return;
                              }
                              setImportError(null);
                              setImportReport({ count: parsed.questions.length, questionsToShow: parsed.questionsToShow });
                            } catch (e: any) {
                              setImportError(e?.message || "Could not read the questions.");
                              setImportReport(null);
                            }
                          }
                          function applyQuizImport() {
                            if (!activePage || !selectedCourse) return;
                            let parsed;
                            try {
                              parsed = parseQuestionsDoc(importDocText);
                            } catch (e: any) {
                              setImportError(e?.message || "Could not read the questions.");
                              return;
                            }
                            const errs = validateQuestions(parsed);
                            if (errs.length) {
                              setImportError(errs.join("\n"));
                              return;
                            }
                            const stamp = Date.now();
                            const newQuestions = parsed.questions.map((q, i) => ({
                              id: `q-${stamp}-${i}`,
                              prompt: q.prompt,
                              options: q.options,
                              correctIndex: q.correctIndex,
                            }));
                            // Drop the empty placeholder question(s), keep real ones, then append.
                            const existing = (activePage.quizQuestions || []).filter(
                              (q) => (q.prompt && q.prompt.trim()) || (q.options || []).some((o) => o && o.trim())
                            );
                            const merged = [...existing, ...newQuestions];
                            const nextPages = pages.map((page) =>
                              page.id === activePage.id
                                ? { ...page, quizQuestions: merged, questionsToShow: parsed.questionsToShow ?? page.questionsToShow }
                                : page
                            );
                            updateCourse({ ...selectedCourse, pages: nextPages });
                            showToast(`${newQuestions.length} question(s) imported — click SAVE to keep them.`, "success");
                            setIsImportQuizModalOpen(false);
                            setImportDocText("");
                            setImportReport(null);
                            setImportError(null);
                          }
                          async function uploadQuizFile(file: File) {
                            const name = file.name.toLowerCase();
                            setImportError(null);
                            setImportReport(null);
                            if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".markdown")) {
                              const reader = new FileReader();
                              reader.onload = () => setImportDocText(String(reader.result || ""));
                              reader.readAsText(file);
                              return;
                            }
                            setImportBusy(true);
                            try {
                              const fd = new FormData();
                              fd.append("file", file);
                              fd.append("mode", "questions");
                              const res = await fetch("/api/admin/parse-quiz-file", { method: "POST", body: fd });
                              const data = await res.json();
                              if (!res.ok || !data.ok) setImportError(data.error || "Could not read that file.");
                              else setImportDocText(data.doc || "");
                            } catch {
                              setImportError("Could not upload the file. Please try again.");
                            } finally {
                              setImportBusy(false);
                            }
                          }

                          function applyFormatting(kind: "h1" | "h2" | "h3" | "h4" | "bold" | "italic" | "underline" | "strike" | "code" | "ul" | "ol" | "quote") {
                            if (kind === "code") {
                              const selection = window.getSelection();
                              if (selection && selection.rangeCount > 0) {
                                const range = selection.getRangeAt(0);
                                const node = selection.anchorNode;
                                let parent = node?.parentElement;
                                let codeElement = null;
                                while (parent && parent !== bodyInputRef.current) {
                                  if (parent.tagName === "CODE") {
                                    codeElement = parent;
                                    break;
                                  }
                                  parent = parent.parentElement;
                                }
                                if (codeElement) {
                                  const text = codeElement.textContent || "";
                                  const textNode = document.createTextNode(text);
                                  codeElement.parentNode?.replaceChild(textNode, codeElement);
                                } else if (!selection.isCollapsed) {
                                  const selectedText = range.toString();
                                  const code = document.createElement("code");
                                  code.style.backgroundColor = "#f4f4f4";
                                  code.style.padding = "2px 4px";
                                  code.style.borderRadius = "3px";
                                  code.style.fontFamily = "monospace";
                                  code.textContent = selectedText;
                                  range.deleteContents();
                                  range.insertNode(code);
                                }
                              }
                            } else if (kind === "quote") {
                              const currentBlock = document.queryCommandValue("formatBlock");
                              if (currentBlock.toLowerCase() === "blockquote") {
                                document.execCommand("formatBlock", false, "p");
                              } else {
                                document.execCommand("formatBlock", false, "blockquote");
                              }
                            } else {
                              document.execCommand(kind === "h1" ? "formatBlock" : kind === "h2" ? "formatBlock" : kind === "h3" ? "formatBlock" : kind === "h4" ? "formatBlock" : kind === "bold" ? "bold" : kind === "italic" ? "italic" : kind === "underline" ? "underline" : kind === "strike" ? "strikeThrough" : kind === "ul" ? "insertUnorderedList" : kind === "ol" ? "insertOrderedList" : "", false, kind === "h1" ? "h1" : kind === "h2" ? "h2" : kind === "h3" ? "h3" : kind === "h4" ? "h4" : undefined);
                            }
                            const editor = bodyInputRef.current;
                            if (editor) {
                              const nextBody = editor.innerHTML;
                              const nextPages = pages.map((page) => (page.id === activePage.id ? { ...page, body: nextBody } : page));
                              updateCourse({ ...(selectedCourse as Course), pages: nextPages });
                            }
                            updateActiveFormats();
                          }
                          function updateActiveFormats() {
                            const formats = new Set<string>();
                            if (document.queryCommandState("bold")) formats.add("bold");
                            if (document.queryCommandState("italic")) formats.add("italic");
                            if (document.queryCommandState("underline")) formats.add("underline");
                            if (document.queryCommandState("strikeThrough")) formats.add("strike");
                            if (document.queryCommandState("insertUnorderedList")) formats.add("ul");
                            if (document.queryCommandState("insertOrderedList")) formats.add("ol");
                            const value = document.queryCommandValue("formatBlock");
                            if (value) formats.add(value.toLowerCase());
                            const selection = window.getSelection();
                            if (selection && selection.rangeCount > 0) {
                              const node = selection.anchorNode;
                              let parent = node?.parentElement;
                              while (parent && parent !== bodyInputRef.current) {
                                if (parent.tagName === "CODE") formats.add("code");
                                if (parent.tagName === "BLOCKQUOTE") formats.add("quote");
                                parent = parent.parentElement;
                              }
                            }
                            setActiveFormats(formats);
                          }
                          return (
                            <>
                              <div className="course-pages-left" style={{ width: `${sidebarWidth}px`, minWidth: '200px', maxWidth: '600px' }}>
                                <div className="course-pages-course-header">
                                  <div className="course-pages-course-header-row">
                                    <div className="course-pages-course-title">{selectedCourse.title}</div>
                                    <div className="course-pages-course-header-right">
                                      <button
                                        type="button"
                                        className="course-page-menu-trigger course-pages-course-menu-trigger"
                                        onClick={() => {
                                          setIsCourseMenuOpen(!isCourseMenuOpen);
                                          setOpenPageMenuId(null);
                                        }}
                                      >
                                        ⋯
                                      </button>
                                      {isCourseMenuOpen && (
                                        <div className="course-page-menu">
                                          <button
                                            type="button"
                                            className="course-page-menu-item"
                                            onClick={() => {
                                              setIsFolderModalOpen(true);
                                              setIsCourseMenuOpen(false);
                                              setNewFolderName("");
                                              setNewFolderPublished(true);
                                            }}
                                          >
                                            Add Module  
                                          </button>
                                          <button type="button" className="course-page-menu-item" onClick={() => addPageForCourse(selectedCourse)}>
                                            Add Lesson
                                          </button>
                                          <button type="button" className="course-page-menu-item" onClick={() => addPageForCourse(selectedCourse, undefined, true)}>
                                            Add Quiz
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="course-pages-course-progress">
                                    <div className="course-pages-course-progress-label">0%</div>
                                    <div className="course-pages-course-progress-track">
                                      <div className="course-pages-course-progress-fill" />
                                    </div>
                                  </div>
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
                                <div 
                                  className={`course-pages-sidebar ${draggedPageId ? 'drag-active' : ''}`}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setDragOverFolderId(null);
                                  }}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (draggedPageId) {
                                      movePageToFolder(draggedPageId, undefined);
                                    }
                                    setDraggedPageId(null);
                                    setDraggedFolderId(null);
                                    setDragOverFolderId(null);
                                    setDragOverPageId(null);
                                    setDragOverPosition(null);
                                  }}
                                >
                                {pages.filter((page) => !page.folderId).map((page) => (
                                  <div
                                    key={page.id}
                                    className={`${activePage && page.id === activePage.id ? "course-pages-item active" : "course-pages-item"} ${draggedPageId === page.id ? 'dragging' : ''} ${dragOverPageId === page.id && dragOverPosition === 'above' ? 'drag-over-above' : ''} ${dragOverPageId === page.id && dragOverPosition === 'below' ? 'drag-over-below' : ''}`}
                                    draggable={true}
                                    onDragStart={(e) => {
                                      console.log('Drag started for page:', page.id);
                                      e.stopPropagation();
                                      setDraggedPageId(page.id);
                                      e.dataTransfer.effectAllowed = 'move';
                                      e.dataTransfer.setData('text/plain', page.id);
                                    }}
                                    onDragEnd={(e) => {
                                      console.log('Drag ended');
                                      e.stopPropagation();
                                      // Always reset drag state on drag end
                                      setTimeout(() => {
                                        setDraggedPageId(null);
                                        setDraggedFolderId(null);
                                        setDragOverFolderId(null);
                                        setDragOverPageId(null);
                                        setDragOverPosition(null);
                                      }, 0);
                                    }}
                                    onDragOver={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      e.dataTransfer.dropEffect = 'move';
                                      if (draggedPageId && draggedPageId !== page.id) {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const midY = rect.top + rect.height / 2;
                                        const position = e.clientY < midY ? 'above' : 'below';
                                        setDragOverPageId(page.id);
                                        setDragOverPosition(position);
                                        setDragOverFolderId(null);
                                      } else if (draggedFolderId) {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const midY = rect.top + rect.height / 2;
                                        const position = e.clientY < midY ? 'above' : 'below';
                                        setDragOverPageId(page.id);
                                        setDragOverPosition(position);
                                        setDragOverFolderId(null);
                                      }
                                    }}
                                    onDragLeave={(e) => {
                                      e.preventDefault();
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      if (
                                        e.clientX < rect.left ||
                                        e.clientX >= rect.right ||
                                        e.clientY < rect.top ||
                                        e.clientY >= rect.bottom
                                      ) {
                                        setDragOverPageId(null);
                                        setDragOverPosition(null);
                                      }
                                    }}
                                    onDrop={(e) => {
                                      console.log('Drop on page:', page.id);
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (draggedPageId && draggedPageId !== page.id && dragOverPosition) {
                                        reorderPages(draggedPageId, page.id, dragOverPosition, undefined);
                                      } else if (draggedFolderId && dragOverPosition) {
                                        insertFolderAtPagePosition(draggedFolderId, page.id, dragOverPosition);
                                      }
                                      setDraggedPageId(null);
                                      setDraggedFolderId(null);
                                      setDragOverPageId(null);
                                      setDragOverPosition(null);
                                      setDragOverFolderId(null);
                                    }}
                                    onMouseDown={(e) => {
                                      // Allow drag to start
                                      e.stopPropagation();
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      // Don't trigger click if we just finished dragging
                                      if (draggedPageId) {
                                        e.preventDefault();
                                        return;
                                      }
                                      setActivePageId(page.id);
                                      setOpenPageMenuId(null);
                                      setIsCourseMenuOpen(false);
                                      setEditingLessonId(null);
                                    }}
                                  >
                                    <span 
                                      className="drag-handle"
                                      style={{ 
                                        cursor: "grab", 
                                        marginRight: "8px",
                                        userSelect: "none",
                                        WebkitUserSelect: "none",
                                        fontSize: "16px",
                                        color: "#9ca3af"
                                      }}
                                      title="Drag to reorder"
                                    >
                                      ⋮⋮
                                    </span>
                                    <span className="course-pages-item-title">
                                      {page.title}
                                      {page.status === "draft" && <span style={{ color: "#9ca3af", fontSize: "12px", marginLeft: "6px" }}>(Draft)</span>}
                                    </span>
                                    <button
                                      type="button"
                                      className="course-page-menu-trigger"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setOpenPageMenuId(openPageMenuId === page.id ? null : page.id);
                                        setIsCourseMenuOpen(false);
                                      }}
                                    >
                                      ⋯
                                    </button>
                                    {openPageMenuId === page.id && (
                                      <div className="course-page-menu">
                                        <button type="button" className="course-page-menu-item" onClick={() => { setActivePageId(page.id); setOpenPageMenuId(null); }}>
                                          Edit Lesson
                                        </button>
                                        <button type="button" className="course-page-menu-item" onClick={() => { 
                                          setChangeModulePageId(page.id);
                                          setSelectedModuleId(page.folderId);
                                          setIsChangeModuleModalOpen(true);
                                          setOpenPageMenuId(null); 
                                        }}>
                                          Change Module  
                                        </button>
                                        <button
                                          type="button"
                                          className="course-page-menu-item course-page-menu-item-danger"
                                          onClick={() => {
                                            setDeleteTarget('lesson');
                                            setDeleteSelectedIds(new Set([page.id]));
                                            setDeleteStep('confirm');
                                            setIsDeleteModalOpen(true);
                                            setOpenPageMenuId(null);
                                          }}
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                                {folders.map((folder) => {
                                  const folderPages = pages.filter((page) => page.folderId === folder.id);
                                  const isCollapsed = collapsedFolders.has(folder.id);
                                  return (
                                    <div 
                                      key={folder.id} 
                                      className={`course-folder-group ${dragOverFolderId === folder.id ? 'drag-over' : ''} ${draggedFolderId === folder.id ? 'dragging' : ''} ${dragOverFolderId === folder.id && dragOverPosition === 'above' ? 'drag-over-above' : ''} ${dragOverFolderId === folder.id && dragOverPosition === 'below' ? 'drag-over-below' : ''}`}
                                      draggable={true}
                                      onDragStart={(e) => {
                                        console.log('Folder drag started:', folder.id);
                                        if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('course-folder-toggle') || (e.target as HTMLElement).classList.contains('course-folder-title')) {
                                          setDraggedFolderId(folder.id);
                                          e.dataTransfer.effectAllowed = 'move';
                                          e.dataTransfer.setData('text/plain', folder.id);
                                        } else {
                                          e.preventDefault();
                                        }
                                      }}
                                      onDragEnd={(e) => {
                                        console.log('Folder drag ended');
                                        // Always reset drag state on drag end
                                        setTimeout(() => {
                                          setDraggedFolderId(null);
                                          setDragOverFolderId(null);
                                          setDragOverPageId(null);
                                          setDragOverPosition(null);
                                        }, 0);
                                      }}
                                      onDragOver={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        e.dataTransfer.dropEffect = 'move';
                                        if (draggedPageId) {
                                          setDragOverFolderId(folder.id);
                                          setDragOverPosition(null);
                                        } else if (draggedFolderId && draggedFolderId !== folder.id) {
                                          const rect = e.currentTarget.getBoundingClientRect();
                                          const midY = rect.top + rect.height / 2;
                                          const position = e.clientY < midY ? 'above' : 'below';
                                          setDragOverFolderId(folder.id);
                                          setDragOverPosition(position);
                                        }
                                      }}
                                      onDragLeave={(e) => {
                                        e.preventDefault();
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        if (
                                          e.clientX < rect.left ||
                                          e.clientX >= rect.right ||
                                          e.clientY < rect.top ||
                                          e.clientY >= rect.bottom
                                        ) {
                                          if (!draggedFolderId) {
                                            setDragOverFolderId(null);
                                          }
                                          setDragOverPosition(null);
                                        }
                                      }}
                                      onDrop={(e) => {
                                        console.log('Drop on folder:', folder.id);
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (draggedPageId) {
                                          movePageToFolder(draggedPageId, folder.id);
                                        } else if (draggedFolderId && draggedFolderId !== folder.id && dragOverPosition) {
                                          reorderFolders(draggedFolderId, folder.id, dragOverPosition);
                                        }
                                        setDraggedPageId(null);
                                        setDraggedFolderId(null);
                                        setDragOverFolderId(null);
                                        setDragOverPageId(null);
                                        setDragOverPosition(null);
                                      }}
                                    >
                                      <div className="course-folder-item">
                                        <span 
                                          className="drag-handle"
                                          style={{ 
                                            cursor: "grab", 
                                            marginRight: "8px",
                                            userSelect: "none",
                                            WebkitUserSelect: "none",
                                            fontSize: "16px",
                                            color: "#9ca3af"
                                          }}
                                          title="Drag to reorder module"
                                        >
                                          ⋮⋮
                                        </span>
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
                                        <span className="course-folder-title">{folder.status === "draft" ? `(Draft) ${folder.title}` : folder.title}</span>
                                        <button
                                          type="button"
                                          className="course-page-menu-trigger"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            setOpenFolderMenuId(openFolderMenuId === folder.id ? null : folder.id);
                                            setOpenPageMenuId(null);
                                            setIsCourseMenuOpen(false);
                                          }}
                                        >
                                          ⋯
                                        </button>
                                        {openFolderMenuId === folder.id && (
                                          <div className="course-page-menu">
                                            <button
                                              type="button"
                                              className="course-page-menu-item"
                                              onClick={() => {
                                                setEditingFolderId(folder.id);
                                                setNewFolderName(folder.title);
                                                setNewFolderPublished(folder.status === "published");
                                                setIsFolderModalOpen(true);
                                                setOpenFolderMenuId(null);
                                              }}
                                            >
                                              Edit Module  
                                            </button>
                                            <button
                                              type="button"
                                              className="course-page-menu-item"
                                              onClick={() => {
                                                addPageForCourse(selectedCourse, folder.id);
                                                setOpenFolderMenuId(null);
                                              }}
                                            >
                                              Add Lesson in Module  
                                            </button>
                                            <button
                                              type="button"
                                              className="course-page-menu-item"
                                              onClick={() => {
                                                addPageForCourse(selectedCourse, folder.id, true);
                                                setOpenFolderMenuId(null);
                                              }}
                                            >
                                              Add quiz
                                            </button>
                                            <button
                                              type="button"
                                              className="course-page-menu-item"
                                              onClick={() => {
                                                const now = Date.now();
                                                const folderPagesInner = pages.filter((page) => page.folderId === folder.id);
                                                const duplicatedFolder: CourseFolder = { ...folder, id: `folder-${now}-copy`, title: `${folder.title} copy` };
                                                const duplicatedPages = folderPagesInner.map((page, index) => ({
                                                  ...page,
                                                  id: `page-${now}-copy-${index}`,
                                                  title: `${page.title} copy`,
                                                  folderId: duplicatedFolder.id
                                                }));
                                                const nextCourse: Course = { ...selectedCourse, folders: [...folders, duplicatedFolder], pages: [...pages, ...duplicatedPages] };
                                                updateCourse(nextCourse);
                                                setOpenFolderMenuId(null);
                                              }}
                                            >
                                              Duplicate Module  
                                            </button>
                                            <button
                                              type="button"
                                              className="course-page-menu-item course-page-menu-item-danger"
                                              onClick={() => {
                                                setDeleteTarget('module');
                                                setDeleteSelectedIds(new Set([folder.id]));
                                                setDeleteStep('confirm');
                                                setIsDeleteModalOpen(true);
                                                setOpenFolderMenuId(null);
                                              }}
                                            >
                                              Delete Module  
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                      {!isCollapsed && folderPages.map((page) => (
                                        <div
                                          key={page.id}
                                          className={`${activePage && page.id === activePage.id ? "course-pages-item course-pages-item-child active" : "course-pages-item course-pages-item-child"} ${draggedPageId === page.id ? 'dragging' : ''} ${dragOverPageId === page.id && dragOverPosition === 'above' ? 'drag-over-above' : ''} ${dragOverPageId === page.id && dragOverPosition === 'below' ? 'drag-over-below' : ''}`}
                                          draggable={true}
                                          onDragStart={(e) => {
                                            console.log('Page in folder drag started:', page.id);
                                            e.stopPropagation();
                                            setDraggedPageId(page.id);
                                            e.dataTransfer.effectAllowed = 'move';
                                            e.dataTransfer.setData('text/plain', page.id);
                                          }}
                                          onDragEnd={(e) => {
                                            console.log('Page in folder drag ended');
                                            e.stopPropagation();
                                            // Always reset drag state on drag end
                                            setTimeout(() => {
                                              setDraggedPageId(null);
                                              setDraggedFolderId(null);
                                              setDragOverFolderId(null);
                                              setDragOverPageId(null);
                                              setDragOverPosition(null);
                                            }, 0);
                                          }}
                                          onDragOver={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            e.dataTransfer.dropEffect = 'move';
                                            if (draggedPageId && draggedPageId !== page.id) {
                                              const rect = e.currentTarget.getBoundingClientRect();
                                              const midY = rect.top + rect.height / 2;
                                              const position = e.clientY < midY ? 'above' : 'below';
                                              setDragOverPageId(page.id);
                                              setDragOverPosition(position);
                                              setDragOverFolderId(null);
                                            }
                                          }}
                                          onDragLeave={(e) => {
                                            e.preventDefault();
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            if (
                                              e.clientX < rect.left ||
                                              e.clientX >= rect.right ||
                                              e.clientY < rect.top ||
                                              e.clientY >= rect.bottom
                                            ) {
                                              setDragOverPageId(null);
                                              setDragOverPosition(null);
                                            }
                                          }}
                                          onDrop={(e) => {
                                            console.log('Drop on page in folder:', page.id);
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (draggedPageId && draggedPageId !== page.id && dragOverPosition) {
                                              reorderPages(draggedPageId, page.id, dragOverPosition, folder.id);
                                            }
                                            // Reset all drag states
                                            setDraggedPageId(null);
                                            setDraggedFolderId(null);
                                            setDragOverPageId(null);
                                            setDragOverPosition(null);
                                            setDragOverFolderId(null);
                                          }}
                                          onMouseDown={(e) => {
                                            // Allow drag to start
                                            e.stopPropagation();
                                          }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            // Don't trigger click if we just finished dragging
                                            if (draggedPageId) {
                                              e.preventDefault();
                                              return;
                                            }
                                            setActivePageId(page.id);
                                            setOpenPageMenuId(null);
                                            setIsCourseMenuOpen(false);
                                            setEditingLessonId(null);
                                          }}
                                        >
                                          <span 
                                            className="drag-handle"
                                            style={{ 
                                              cursor: "grab", 
                                              marginRight: "8px",
                                              userSelect: "none",
                                              WebkitUserSelect: "none",
                                              fontSize: "16px",
                                              color: "#9ca3af"
                                            }}
                                            title="Drag to reorder"
                                          >
                                            ⋮⋮
                                          </span>
                                          <span className="course-pages-item-title">
                                            {page.title}
                                            {page.status === "draft" && <span style={{ color: "#9ca3af", fontSize: "12px", marginLeft: "6px" }}>(Draft)</span>}
                                          </span>
                                          <button
                                            type="button"
                                            className="course-page-menu-trigger"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              setOpenPageMenuId(openPageMenuId === page.id ? null : page.id);
                                              setIsCourseMenuOpen(false);
                                            }}
                                          >
                                            ⋯
                                          </button>
                                          {openPageMenuId === page.id && (
                                            <div className="course-page-menu">
                                              <button type="button" className="course-page-menu-item" onClick={() => { setActivePageId(page.id); setOpenPageMenuId(null); }}>
                                                Edit Lesson
                                              </button>
                                              <button type="button" className="course-page-menu-item" onClick={() => { 
                                                setChangeModulePageId(page.id);
                                                setSelectedModuleId(page.folderId);
                                                setIsChangeModuleModalOpen(true);
                                                setOpenPageMenuId(null); 
                                              }}>
                                                Change Module  
                                              </button>
                                              <button
                                                type="button"
                                                className="course-page-menu-item course-page-menu-item-danger"
                                                onClick={() => {
                                                  setDeleteTarget('lesson');
                                                  setDeleteSelectedIds(new Set([page.id]));
                                                  setDeleteStep('confirm');
                                                  setIsDeleteModalOpen(true);
                                                  setOpenPageMenuId(null);
                                                }}
                                              >
                                                Delete
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
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
                                    {activePage.isQuiz ? (
                                      <>
                                        <div className="course-page-main-header" key="quiz-header" style={{ display: "flex", flexDirection: "row", gap: 8, alignItems: "center" }}>
                                          <input
                                            className="course-page-title-input"
                                            style={{ flex: 1 }}
                                            value={activePage.title}
                                            onChange={(event) => {
                                              const nextPages = pages.map((page) => (page.id === activePage.id ? { ...page, title: event.target.value } : page));
                                              updateCourse({ ...selectedCourse, pages: nextPages });
                                            }}
                                          />
                                          <button
                                            type="button"
                                            className="btn-secondary btn-small"
                                            style={{ whiteSpace: "nowrap", backgroundColor: "#111827", color: "#ffffff", border: "none" }}
                                            onClick={() => {
                                              setImportDocText("");
                                              setImportReport(null);
                                              setImportError(null);
                                              setIsImportQuizModalOpen(true);
                                            }}
                                          >
                                            ⬆ Import Quiz
                                          </button>
                                        </div>
                                        {isImportQuizModalOpen && (
                                          <div className="overlay" style={{ zIndex: 9998 }}>
                                            <div className="dialog" style={{ maxWidth: 720, width: "92%" }}>
                                              <div className="dialog-title">Import questions into “{activePage.title}”</div>
                                              <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 10, lineHeight: 1.5 }}>
                                                Paste your questions below or upload a file. No course or lesson name needed —
                                                everything goes into <strong>this</strong> quiz. Options can be lettered
                                                (<code>A.</code> <code>B.</code> …) with a <code>Correct Answer: C</code> line, or use
                                                <code>{" * "}</code> to mark the right one. Optional <code>{"Show: N"}</code> sets how many to show.
                                              </div>
                                              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}>
                                                <strong>Excel (.xlsx):</strong> columns <code>Question</code>,
                                                <code> Option A</code>, <code>Option B</code>, <code>Option C</code>, <code>Option D</code>,
                                                <code> Correct</code> (A/B/C/D), optional <code>Show</code>.
                                              </div>
                                              <label className="field">
                                                <span className="field-label">Questions</span>
                                                <textarea
                                                  className="field-input"
                                                  style={{ minHeight: 200, fontFamily: "monospace", fontSize: 12, whiteSpace: "pre" }}
                                                  placeholder={"Questions to show the user\n3\n\n1. What is the capital of France?\nA. Berlin\nB. Madrid\nC. Paris\nD. Rome\nCorrect Answer: C. Paris"}
                                                  value={importDocText}
                                                  onChange={(e) => setImportDocText(e.target.value)}
                                                  disabled={importBusy}
                                                />
                                                <div className="field-helper">
                                                  Or upload a file (.xlsx, .docx, .txt, .md):&nbsp;
                                                  <input
                                                    type="file"
                                                    accept=".txt,.md,.markdown,.doc,.docx,.xls,.xlsx,.csv"
                                                    disabled={importBusy}
                                                    onChange={(e) => {
                                                      const file = e.target.files?.[0];
                                                      if (file) uploadQuizFile(file);
                                                      e.target.value = "";
                                                    }}
                                                  />
                                                </div>
                                              </label>
                                              {importError && (
                                                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 8, padding: "10px 12px", fontSize: 12, whiteSpace: "pre-wrap", marginTop: 8 }}>
                                                  {importError}
                                                </div>
                                              )}
                                              {importReport && (
                                                <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginTop: 8 }}>
                                                  ✅ {importReport.count} question(s) ready to import
                                                  {importReport.questionsToShow ? `, showing ${importReport.questionsToShow} per attempt` : ""}.
                                                </div>
                                              )}
                                              <div className="dialog-footer">
                                                <div className="dialog-actions">
                                                  <button type="button" className="btn-secondary btn-cancel" disabled={importBusy} onClick={() => setIsImportQuizModalOpen(false)}>
                                                    Cancel
                                                  </button>
                                                  <button type="button" className="btn-secondary btn-small" disabled={importBusy || !importDocText.trim()} onClick={previewQuizImport}>
                                                    {importBusy ? "Working…" : "Preview"}
                                                  </button>
                                                  <button type="button" className="btn-primary btn-success" disabled={importBusy || !importDocText.trim()} onClick={applyQuizImport}>
                                                    {importBusy ? "Working…" : "Import"}
                                                  </button>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                        <div className="course-page-editor-body" key="quiz-editor-body">
                                          <div className="field" style={{ marginBottom: 24, padding: 16, border: "1px solid #e5e7eb", borderRadius: 8, display: "block" }}>
                                            <span className="field-label">Questions to show the user</span>
                                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                              <input
                                                className="field-input"
                                                type="number"
                                                min={0}
                                                max={(activePage.quizQuestions || []).length}
                                                placeholder={`All (${(activePage.quizQuestions || []).length})`}
                                                value={activePage.questionsToShow ?? ""}
                                                style={{ flex: 1 }}
                                                onChange={(e) => {
                                                  const raw = e.target.value;
                                                  const parsed = raw === "" ? undefined : Math.max(0, Math.floor(Number(raw) || 0));
                                                  const nextPages = pages.map((page) => (page.id === activePage.id ? { ...page, questionsToShow: parsed } : page));
                                                  updateCourse({ ...selectedCourse, pages: nextPages });
                                                }}
                                              />
                                              <button
                                                type="button"
                                                className="btn-primary btn-small"
                                                disabled={isSavingLesson}
                                                onClick={async () => { await saveLessonOrQuiz('quiz'); }}
                                              >
                                                {isSavingLesson ? "Saving…" : "Save"}
                                              </button>
                                            </div>
                                            <span className="field-hint" style={{ display: "block", marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                                              Each attempt randomly picks this many questions out of the {(activePage.quizQuestions || []).length} below. Leave blank to show all.
                                            </span>
                                          </div>
                                          {(activePage.quizQuestions || []).map((q, qIdx) => (
                                            <div key={q.id} style={{ marginBottom: 24, padding: 16, border: "1px solid #e5e7eb", borderRadius: 8 }}>
                                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                                <span style={{ fontWeight: 600 }}>Question {qIdx + 1}</span>
                                                <button
                                                  type="button"
                                                  className="btn-ghost btn-danger btn-small"
                                                  onClick={() => {
                                                    const nextQuestions = (activePage.quizQuestions || []).filter((_, i) => i !== qIdx);
                                                    const nextPages = pages.map((page) => (page.id === activePage.id ? { ...page, quizQuestions: nextQuestions } : page));
                                                    updateCourse({ ...selectedCourse, pages: nextPages });
                                                  }}
                                                >
                                                  Delete
                                                </button>
                                              </div>
                                              <label className="field">
                                                <span className="field-label">Question</span>
                                                <textarea
                                                  className="field-input"
                                                  rows={3}
                                                  value={q.prompt}
                                                  onChange={(e) => {
                                                    const nextQuestions = [...(activePage.quizQuestions || [])];
                                                    nextQuestions[qIdx] = { ...q, prompt: e.target.value };
                                                    const nextPages = pages.map((page) => (page.id === activePage.id ? { ...page, quizQuestions: nextQuestions } : page));
                                                    updateCourse({ ...selectedCourse, pages: nextPages });
                                                  }}
                                                />
                                              </label>
                                              {q.options.map((option, optIdx) => (
                                                <label key={optIdx} className="field" style={{ marginTop: 12 }}>
                                                  <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                                                      <input
                                                        type="radio"
                                                        name={`correct-${q.id}`}
                                                        checked={q.correctIndex === optIdx}
                                                        onChange={() => {
                                                          const nextQuestions = [...(activePage.quizQuestions || [])];
                                                          nextQuestions[qIdx] = { ...q, correctIndex: optIdx };
                                                          const nextPages = pages.map((page) => (page.id === activePage.id ? { ...page, quizQuestions: nextQuestions } : page));
                                                          updateCourse({ ...selectedCourse, pages: nextPages });
                                                        }}
                                                      />
                                                      <span className="field-label" style={{ marginBottom: 0 }}>{String.fromCharCode(65 + optIdx)}</span>
                                                    </div>
                                                    {q.options.length > 2 && (
                                                      <button
                                                        type="button"
                                                        className="btn-ghost btn-danger btn-small"
                                                        style={{ padding: "4px 8px", fontSize: "12px" }}
                                                        onClick={() => {
                                                          const nextQuestions = [...(activePage.quizQuestions || [])];
                                                          const nextOptions = q.options.filter((_, i) => i !== optIdx);
                                                          // Adjust correctIndex if needed
                                                          let newCorrectIndex = q.correctIndex;
                                                          if (q.correctIndex === optIdx) {
                                                            newCorrectIndex = 0; // Reset to first option if deleted option was correct
                                                          } else if (q.correctIndex > optIdx) {
                                                            newCorrectIndex = q.correctIndex - 1; // Shift down if after deleted option
                                                          }
                                                          nextQuestions[qIdx] = { ...q, options: nextOptions, correctIndex: newCorrectIndex };
                                                          const nextPages = pages.map((page) => (page.id === activePage.id ? { ...page, quizQuestions: nextQuestions } : page));
                                                          updateCourse({ ...selectedCourse, pages: nextPages });
                                                        }}
                                                      >
                                                        Remove
                                                      </button>
                                                    )}
                                                  </div>
                                                  <input
                                                    className="field-input"
                                                    value={option}
                                                    onChange={(e) => {
                                                      const nextQuestions = [...(activePage.quizQuestions || [])];
                                                      const nextOptions = [...q.options];
                                                      nextOptions[optIdx] = e.target.value;
                                                      nextQuestions[qIdx] = { ...q, options: nextOptions };
                                                      const nextPages = pages.map((page) => (page.id === activePage.id ? { ...page, quizQuestions: nextQuestions } : page));
                                                      updateCourse({ ...selectedCourse, pages: nextPages });
                                                    }}
                                                  />
                                                </label>
                                              ))}
                                              <button
                                                type="button"
                                                className="btn-secondary btn-small"
                                                style={{ marginTop: 12 }}
                                                onClick={() => {
                                                  const nextQuestions = [...(activePage.quizQuestions || [])];
                                                  const nextOptions = [...q.options, ""];
                                                  nextQuestions[qIdx] = { ...q, options: nextOptions };
                                                  const nextPages = pages.map((page) => (page.id === activePage.id ? { ...page, quizQuestions: nextQuestions } : page));
                                                  updateCourse({ ...selectedCourse, pages: nextPages });
                                                }}
                                              >
                                                + Add Option
                                              </button>
                                            </div>
                                          ))}
                                          <button
                                            type="button"
                                            className="btn-secondary"
                                            onClick={() => {
                                              const newQuestion = { id: `q-${Date.now()}`, prompt: "", options: ["", "", "", ""], correctIndex: 0 };
                                              const nextQuestions = [...(activePage.quizQuestions || []), newQuestion];
                                              const nextPages = pages.map((page) => (page.id === activePage.id ? { ...page, quizQuestions: nextQuestions } : page));
                                              updateCourse({ ...selectedCourse, pages: nextPages });
                                            }}
                                          >
                                            + Add Question
                                          </button>
                                        </div>
                                        <div className="course-page-footer">
                                          <div />
                                          <button
                                            type="button"
                                            className={activePage.status === "published" ? "status-toggle status-toggle-on" : "status-toggle"}
                                            onClick={() => {
                                              const nextPages = pages.map((page) =>
                                                page.id === activePage.id
                                                  ? { ...page, status: (page.status === "published" ? "draft" : "published") as CoursePage["status"] }
                                                  : page
                                              );
                                              updateCourse({ ...selectedCourse, pages: nextPages });
                                            }}
                                          >
                                            <span className={activePage.status === "published" ? "status-toggle-label status-toggle-label-on" : "status-toggle-label"}>{activePage.status === "published" ? "Published" : "Draft"}</span>
                                            <span className="status-toggle-track">
                                              <span className="status-toggle-thumb" />
                                            </span>
                                          </button>
                                          <button type="button" className="course-page-footer-button course-page-footer-cancel" onClick={() => setDetailSection("overview")}>
                                            CANCEL
                                          </button>
                                          <button 
                                            type="button" 
                                            className="course-page-footer-button course-page-footer-save" 
                                            onClick={async () => {
                                              await saveLessonOrQuiz('quiz');
                                            }}
                                            disabled={isSavingLesson}
                                            style={isSavingLesson ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
                                          >
                                            {isSavingLesson ? 'SAVING...' : 'SAVE'}
                                          </button>
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                    <div className="course-page-main-header" key="lesson-header">
                                      {editingLessonId === activePage.id && (
                                        <div className="course-page-toolbar">
                                          <button type="button" className={activeFormats.has("h1") ? "course-page-toolbar-button active" : "course-page-toolbar-button"} onClick={() => applyFormatting("h1")}>H1</button>
                                          <button type="button" className={activeFormats.has("h2") ? "course-page-toolbar-button active" : "course-page-toolbar-button"} onClick={() => applyFormatting("h2")}>H2</button>
                                          <button type="button" className={activeFormats.has("h3") ? "course-page-toolbar-button active" : "course-page-toolbar-button"} onClick={() => applyFormatting("h3")}>H3</button>
                                          <button type="button" className={activeFormats.has("h4") ? "course-page-toolbar-button active" : "course-page-toolbar-button"} onClick={() => applyFormatting("h4")}>H4</button>
                                          <span style={{ borderLeft: "1px solid #ddd", height: "20px", margin: "0 8px" }} />
                                          <button type="button" className={activeFormats.has("bold") ? "course-page-toolbar-button course-page-toolbar-button-bold active" : "course-page-toolbar-button course-page-toolbar-button-bold"} onClick={() => applyFormatting("bold")}>B</button>
                                          <button type="button" className={activeFormats.has("italic") ? "course-page-toolbar-button course-page-toolbar-button-italic active" : "course-page-toolbar-button course-page-toolbar-button-italic"} onClick={() => applyFormatting("italic")}>I</button>
                                          <button type="button" className={activeFormats.has("underline") ? "course-page-toolbar-button active" : "course-page-toolbar-button"} onClick={() => applyFormatting("underline")}>U</button>
                                          <button type="button" className={activeFormats.has("strike") ? "course-page-toolbar-button course-page-toolbar-button-strike active" : "course-page-toolbar-button course-page-toolbar-button-strike"} onClick={() => applyFormatting("strike")}>S</button>
                                          <button type="button" className={activeFormats.has("code") ? "course-page-toolbar-button course-page-toolbar-button-icon active" : "course-page-toolbar-button course-page-toolbar-button-icon"} onClick={() => applyFormatting("code")}>{"</>"}</button>
                                          <span style={{ borderLeft: "1px solid #ddd", height: "20px", margin: "0 8px" }} />
                                          <button type="button" className={activeFormats.has("ul") ? "course-page-toolbar-button course-page-toolbar-button-icon active" : "course-page-toolbar-button course-page-toolbar-button-icon"} onClick={() => applyFormatting("ul")}>•</button>
                                          <button type="button" className={activeFormats.has("ol") ? "course-page-toolbar-button course-page-toolbar-button-icon active" : "course-page-toolbar-button course-page-toolbar-button-icon"} onClick={() => applyFormatting("ol")}>1.</button>
                                          <button type="button" className={activeFormats.has("quote") ? "course-page-toolbar-button course-page-toolbar-button-icon active" : "course-page-toolbar-button course-page-toolbar-button-icon"} onClick={() => applyFormatting("quote")}>"</button>
                                          <span style={{ borderLeft: "1px solid #ddd", height: "20px", margin: "0 8px" }} />
                                          <button type="button" className="course-page-toolbar-button course-page-toolbar-button-icon" onClick={() => { setImageUrlDraft(""); setIsImageModalOpen(true); }}>🖼</button>
                                          <button type="button" className="course-page-toolbar-button course-page-toolbar-button-icon" onClick={() => { setLinkLabelDraft(""); setLinkUrlDraft(""); setIsLinkModalOpen(true); }}>🔗</button>
                                          <button
                                            type="button"
                                            className="course-page-toolbar-button course-page-toolbar-button-icon course-page-toolbar-button-video"
                                            onClick={() => {
                                              setVideoUrlDraft("");
                                              setIsVideoModalOpen(true);
                                            }}
                                          >
                                            ▶
                                          </button>
                                        </div>
                                      )}
                                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                                        {editingLessonId === activePage.id ? (
                                          <input
                                            className="course-page-title-input"
                                            value={activePage.title}
                                            onChange={(event) => {
                                              const nextPages = pages.map((page) => (page.id === activePage.id ? { ...page, title: event.target.value } : page));
                                              updateCourse({ ...selectedCourse, pages: nextPages });
                                            }}
                                          />
                                        ) : (
                                          <>
                                            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>{activePage.title}</h2>
                                            <button
                                              type="button"
                                              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, padding: 4 }}
                                              onClick={() => setEditingLessonId(activePage.id)}
                                              title="Edit lesson"
                                            >
                                              ✏️
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                    <div className="course-page-editor-body" key="lesson-editor-body">
                                      <div
                                        ref={bodyInputRef}
                                        className="course-page-body-input"
                                        contentEditable={editingLessonId === activePage.id}
                                        suppressContentEditableWarning
                                        onInput={(event) => {
                                          const nextBody = event.currentTarget.innerHTML;
                                          const nextPages = pages.map((page) => (page.id === activePage.id ? { ...page, body: nextBody } : page));
                                          updateCourse({ ...selectedCourse, pages: nextPages });
                                        }}
                                        onMouseUp={updateActiveFormats}
                                        onKeyUp={updateActiveFormats}
                                        onKeyDown={(event) => {
                                          if (event.key === "Backspace") {
                                            const selection = window.getSelection();
                                            if (selection && selection.rangeCount > 0 && selection.isCollapsed) {
                                              const range = selection.getRangeAt(0);
                                              const node = range.startContainer;
                                              const offset = range.startOffset;
                                              
                                              if (offset === 0 && node.previousSibling) {
                                                const prev = node.previousSibling;
                                                if (prev.nodeType === Node.ELEMENT_NODE && (prev as Element).getAttribute("contenteditable") === "false") {
                                                  event.preventDefault();
                                                  prev.remove();
                                                  const nextBody = bodyInputRef.current?.innerHTML || "";
                                                  const nextPages = pages.map((page) => (page.id === activePage.id ? { ...page, body: nextBody } : page));
                                                  updateCourse({ ...selectedCourse, pages: nextPages });
                                                }
                                              }
                                            }
                                          }
                                        }}
                                        onFocus={(event) => {
                                          if (activePageId !== lastPageId) {
                                            event.currentTarget.innerHTML = activePage.body || "";
                                            setLastPageId(activePageId);
                                          }
                                        }}
                                        style={{
                                          padding: "12px",
                                          border: "1px solid #ddd",
                                          borderRadius: "4px",
                                          outline: "none",
                                          whiteSpace: "pre-wrap",
                                          wordBreak: "break-word",
                                          overflowWrap: "anywhere",
                                          boxSizing: "border-box",
                                          width: "100%",
                                          maxWidth: "100%"
                                        }}
                                      />
                                    </div>
                                    
                                    {(activePage.resourceLinks && activePage.resourceLinks.length > 0) || (activePage.fileUrls && activePage.fileUrls.length > 0) ? (
                                      <div style={{ marginTop: 24 }}>
                                        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Resources</h3>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                          {activePage.resourceLinks?.map((link, idx) => {
                                            if (!link || !link.href) return null;
                                            return (
                                            <div
                                              key={idx}
                                              style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 8,
                                                padding: "8px 12px",
                                                backgroundColor: "#f9fafb",
                                                borderRadius: 6,
                                                position: "relative"
                                              }}
                                            >
                                              <div style={{ width: 24, height: 24, backgroundColor: "#ef4444", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 16 }}>{getResourceIcon(link.href)}</div>
                                              <a href={link.href} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textDecoration: "none", color: "#111827", fontSize: 14 }}>{link.label}</a>
                                              {editingLessonId === activePage.id && (
                                                <button
                                                  type="button"
                                                  style={{ background: "none", border: "none", cursor: "pointer", padding: 4, fontSize: 16 }}
                                                  onClick={() => setOpenResourceMenuId(openResourceMenuId === `link-${idx}` ? null : `link-${idx}`)}
                                                >
                                                  ⋯
                                                </button>
                                              )}
                                              {openResourceMenuId === `link-${idx}` && (
                                                <div className="course-page-menu" style={{ right: 0, top: "100%", marginTop: 4 }}>
                                                  <button
                                                    type="button"
                                                    className="course-page-menu-item"
                                                    onClick={() => {
                                                      setEditingResourceIndex(idx);
                                                      setEditingResourceType('link');
                                                      setLinkLabelDraft(link.label);
                                                      setLinkUrlDraft(link.href);
                                                      setIsLinkModalOpen(true);
                                                      setOpenResourceMenuId(null);
                                                    }}
                                                  >
                                                    Edit
                                                  </button>
                                                  <button
                                                    type="button"
                                                    className="course-page-menu-item"
                                                    disabled={idx === 0}
                                                    onClick={() => {
                                                      if (idx > 0) {
                                                        const links = [...(activePage.resourceLinks || [])];
                                                        [links[idx - 1], links[idx]] = [links[idx], links[idx - 1]];
                                                        const nextPages = pages.map((page) => page.id === activePage.id ? { ...page, resourceLinks: links } : page);
                                                        updateCourse({ ...selectedCourse, pages: nextPages });
                                                      }
                                                      setOpenResourceMenuId(null);
                                                    }}
                                                  >
                                                    Move Up
                                                  </button>
                                                  <button
                                                    type="button"
                                                    className="course-page-menu-item"
                                                    disabled={idx === (activePage.resourceLinks?.length || 0) - 1}
                                                    onClick={() => {
                                                      const links = [...(activePage.resourceLinks || [])];
                                                      if (idx < links.length - 1) {
                                                        [links[idx], links[idx + 1]] = [links[idx + 1], links[idx]];
                                                        const nextPages = pages.map((page) => page.id === activePage.id ? { ...page, resourceLinks: links } : page);
                                                        updateCourse({ ...selectedCourse, pages: nextPages });
                                                      }
                                                      setOpenResourceMenuId(null);
                                                    }}
                                                  >
                                                    Move Down
                                                  </button>
                                                  <button
                                                    type="button"
                                                    className="course-page-menu-item course-page-menu-item-danger"
                                                    onClick={() => {
                                                      const links = (activePage.resourceLinks || []).filter((_, i) => i !== idx);
                                                      const nextPages = pages.map((page) => page.id === activePage.id ? { ...page, resourceLinks: links } : page);
                                                      updateCourse({ ...selectedCourse, pages: nextPages });
                                                      setOpenResourceMenuId(null);
                                                    }}
                                                  >
                                                    Delete
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                            );
                                          })}
                                          {activePage.fileUrls?.map((fileUrl, idx) => {
                                            const fileData = fileUrl;
                                            if (!fileData || !fileData.href) return null;
                                            return (
                                            <div
                                              key={idx}
                                              style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 8,
                                                padding: "8px 12px",
                                                backgroundColor: "#f9fafb",
                                                borderRadius: 6,
                                                position: "relative"
                                              }}
                                            >
                                              <div style={{ width: 24, height: 24, backgroundColor: "#ef4444", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 16 }}>{getResourceIcon(fileData.href)}</div>
                                              <a href={fileData.href} target="_blank" rel="noopener noreferrer" download style={{ flex: 1, textDecoration: "none", color: "#111827", fontSize: 14 }}>{fileData.label}</a>
                                              {editingLessonId === activePage.id && (
                                                <button
                                                  type="button"
                                                  style={{ background: "none", border: "none", cursor: "pointer", padding: 4, fontSize: 16 }}
                                                  onClick={() => setOpenResourceMenuId(openResourceMenuId === `file-${idx}` ? null : `file-${idx}`)}
                                                >
                                                  ⋯
                                                </button>
                                              )}
                                              {openResourceMenuId === `file-${idx}` && (
                                                <div className="course-page-menu" style={{ right: 0, top: "100%", marginTop: 4 }}>
                                                  <button
                                                    type="button"
                                                    className="course-page-menu-item"
                                                    onClick={() => {
                                                      setEditingResourceIndex(idx);
                                                      setEditingResourceType('file');
                                                      setResourceFileLabelDraft(fileData.label);
                                                      setResourceFileUrlDraft(fileData.href);
                                                      setIsResourceFileModalOpen(true);
                                                      setOpenResourceMenuId(null);
                                                    }}
                                                  >
                                                    Edit
                                                  </button>
                                                  <button
                                                    type="button"
                                                    className="course-page-menu-item"
                                                    disabled={idx === 0}
                                                    onClick={() => {
                                                      if (idx > 0) {
                                                        const files = [...(activePage.fileUrls || [])];
                                                        [files[idx - 1], files[idx]] = [files[idx], files[idx - 1]];
                                                        const nextPages = pages.map((page) => page.id === activePage.id ? { ...page, fileUrls: files } : page);
                                                        updateCourse({ ...selectedCourse, pages: nextPages });
                                                      }
                                                      setOpenResourceMenuId(null);
                                                    }}
                                                  >
                                                    Move Up
                                                  </button>
                                                  <button
                                                    type="button"
                                                    className="course-page-menu-item"
                                                    disabled={idx === (activePage.fileUrls?.length || 0) - 1}
                                                    onClick={() => {
                                                      const files = [...(activePage.fileUrls || [])];
                                                      if (idx < files.length - 1) {
                                                        [files[idx], files[idx + 1]] = [files[idx + 1], files[idx]];
                                                        const nextPages = pages.map((page) => page.id === activePage.id ? { ...page, fileUrls: files } : page);
                                                        updateCourse({ ...selectedCourse, pages: nextPages });
                                                      }
                                                      setOpenResourceMenuId(null);
                                                    }}
                                                  >
                                                    Move Down
                                                  </button>
                                                  <button
                                                    type="button"
                                                    className="course-page-menu-item course-page-menu-item-danger"
                                                    onClick={() => {
                                                      const files = (activePage.fileUrls || []).filter((_, i) => i !== idx);
                                                      const nextPages = pages.map((page) => page.id === activePage.id ? { ...page, fileUrls: files } : page);
                                                      updateCourse({ ...selectedCourse, pages: nextPages });
                                                      setOpenResourceMenuId(null);
                                                    }}
                                                  >
                                                    Delete
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ) : null}
                                    
                                    <div className="course-page-footer">
                                      <div className="course-page-add">
                                        <button type="button" className="course-page-add-button" onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}>
                                          <span>ADD</span>
                                          <span className="course-page-add-chevron">{isAddMenuOpen ? "˄" : "˅"}</span>
                                        </button>
                                        {isAddMenuOpen && (
                                          <div className="course-page-add-menu">
                                            <button
                                              type="button"
                                              className="course-page-menu-item"
                                              onClick={() => {
                                                console.log('Add resource link clicked');
                                                setLinkLabelDraft("");
                                                setLinkUrlDraft("");
                                                setIsLinkModalOpen(true);
                                                setIsAddMenuOpen(false);
                                              }}
                                            >
                                              Add resource link
                                            </button>
                                            <button
                                              type="button"
                                              className="course-page-menu-item"
                                              onClick={() => {
                                                console.log('Add resource file clicked');
                                                setResourceFileUrlDraft("");
                                                setResourceFileLabelDraft("");
                                                setIsResourceFileModalOpen(true);
                                                setIsAddMenuOpen(false);
                                              }}
                                            >
                                              Add resource file
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                      <button
                                        type="button"
                                        className={activePage.status === "published" ? "status-toggle status-toggle-on" : "status-toggle"}
                                        onClick={() => {
                                          const nextPages = pages.map((page) =>
                                            page.id === activePage.id
                                              ? { ...page, status: (page.status === "published" ? "draft" : "published") as CoursePage["status"] }
                                              : page
                                          );
                                          updateCourse({ ...selectedCourse, pages: nextPages });
                                        }}
                                      >
                                        <span className={activePage.status === "published" ? "status-toggle-label status-toggle-label-on" : "status-toggle-label"}>{activePage.status === "published" ? "Published" : "Draft"}</span>
                                        <span className="status-toggle-track">
                                          <span className="status-toggle-thumb" />
                                        </span>
                                      </button>
                                      {editingLessonId === activePage.id && (
                                        <>
                                          <button type="button" className="course-page-footer-button course-page-footer-cancel" onClick={() => setEditingLessonId(null)}>
                                            CANCEL
                                          </button>
                                          <button 
                                            type="button" 
                                            className="course-page-footer-button course-page-footer-save" 
                                            onClick={async () => {
                                              await saveLessonOrQuiz('lesson');
                                              setEditingLessonId(null);
                                            }}
                                            disabled={isSavingLesson}
                                            style={isSavingLesson ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
                                          >
                                            {isSavingLesson ? 'SAVING...' : 'SAVE'}
                                          </button>
                                        </>
                                      )}
                                    </div>
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            </>
                          );
                        })()}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="panel-empty">Select or create a course to edit details.</div>
        )}
      </div>

      {/* Saving Modal with Spinner */}
      {isSavingLesson && (
        <div style={{
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
          <div style={{
            backgroundColor: 'white',
            borderRadius: 12,
            padding: '32px 48px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 20,
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{
              width: 48,
              height: 48,
              border: '4px solid #f3f4f6',
              borderTop: '4px solid #3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <div style={{
              fontSize: 18,
              fontWeight: 600,
              color: '#111827'
            }}>
              {savingMessage}
            </div>
          </div>
        </div>
      )}

      {/* Add spinner animation */}
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}




