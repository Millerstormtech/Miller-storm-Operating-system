// What the Enter key does in the Storm Chat message box (web).
//
// Nadine (2026-10-12, again 2026-10-15): "Fix the return button, now it shows
// send directly and no option to return." People need to write messages longer
// than one line.
//
// - Computer (mouse + keyboard): Enter sends, Shift+Enter starts a new line.
//   A hint under the box says so.
// - Touch screen (phone or tablet browser): there is no Shift key, so Enter
//   always starts a new line and only the Send button sends. Same as the phone
//   app (Jamesapk storm_chat_room_screen.dart, TextInputAction.newline).

export type EnterKeyInput = {
  key: string;
  shiftKey: boolean;
  /** true on touch screens, from matchMedia("(pointer: coarse)") */
  touchScreen: boolean;
};

/** true when this key press should send the message instead of typing it. */
export function enterSendsMessage({ key, shiftKey, touchScreen }: EnterKeyInput): boolean {
  if (key !== "Enter") return false;
  if (touchScreen) return false;
  return !shiftKey;
}
