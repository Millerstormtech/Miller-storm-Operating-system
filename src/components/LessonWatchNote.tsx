// Reminder shown above a video lesson: the next step only unlocks once the
// video is fully watched.
export function LessonWatchNote() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "#fffbeb",
        border: "1px solid #fde68a",
        color: "#92400e",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 13.5,
        fontWeight: 500,
        margin: "0 12px 14px",
      }}
    >
      <span style={{ fontSize: 16, lineHeight: 1 }}>⚠️</span>
      <span>You need to attempt the video/quiz till the very last second in order to unlock the next step.</span>
    </div>
  );
}
