import { requestTourRestart } from "./tourRegistry";

/**
 * The replay control, rendered by PageHeader whenever a tour is on screen.
 * It carries data-tour="tour-button" so the final step of every tour can
 * spotlight it and say "replay from here".
 */
export function TourButton() {
  return (
    <button
      type="button"
      data-tour="tour-button"
      onClick={requestTourRestart}
      title="Replay the guide for this page"
      aria-label="Replay the guide for this page"
      style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        border: "none",
        background: "#6366f1",
        color: "#fff",
        fontSize: 15,
        fontWeight: 700,
        lineHeight: 1,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        zIndex: 1200,
      }}
    >
      ?
    </button>
  );
}
