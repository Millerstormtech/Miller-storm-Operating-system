import { isPageComplete } from "../lib/training/scoring";
import type { CoursePage, QuizResultLike } from "../lib/training/scoring";

/**
 * The grey -> green completion tick shown beside a lesson or quiz.
 *
 * Grey  = not finished yet
 * Green = finished (video watched, or quiz passed at >=80%)
 *
 * Reads the SAME rule as the leaderboard, so a green tick can never disagree
 * with a rep's reported progress.
 */
export function LessonTick({
  page,
  completedPages,
  quizResults,
  size = 18,
  style,
}: {
  page: CoursePage;
  completedPages: Set<string> | string[];
  quizResults: QuizResultLike[];
  size?: number;
  style?: React.CSSProperties;
}) {
  const done = isPageComplete(page, completedPages, quizResults);
  return (
    <div
      title={done ? "Completed" : page.isQuiz ? "Not passed yet" : "Not watched yet"}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2px solid ${done ? "#10b981" : "#d1d5db"}`,
        background: done ? "#10b981" : "transparent",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      {done && <span style={{ color: "#fff", fontSize: Math.round(size * 0.56) }}>✓</span>}
    </div>
  );
}
