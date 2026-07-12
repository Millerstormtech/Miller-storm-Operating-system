// Lightweight bridge between anywhere in the app and the mounted <AppDialogs/>
// host. Lets us show branded in-app toasts + confirm modals instead of the
// browser's native alert()/confirm() ("localhost says …") dialogs.

export type ToastType = "info" | "success" | "error";

type NotifyFn = (message: string, type: ToastType) => void;
type ConfirmFn = (message: string) => Promise<boolean>;

let _notify: NotifyFn | null = null;
let _confirm: ConfirmFn | null = null;

// Called by <AppDialogs/> once it mounts.
export function registerDialogHost(notify: NotifyFn, confirm: ConfirmFn) {
  _notify = notify;
  _confirm = confirm;
}

// Infer a toast tone from the message text so error/success get the right color
// without every call site having to say so (used by the window.alert override).
export function inferToastType(message: string): ToastType {
  const m = message.toLowerCase();
  if (/fail|error|invalid|wrong|not\s|cannot|couldn'?t|⚠️|denied|unable/.test(m)) return "error";
  if (/success|saved|created|updated|deleted|sent|added|complete|done|✓|✅/.test(m)) return "success";
  return "info";
}

// Show a branded toast. Falls back to native alert if the host isn't mounted yet.
export function notify(message: string, type?: ToastType) {
  const t = type ?? inferToastType(message);
  if (_notify) _notify(message, t);
  else if (typeof window !== "undefined") window.alert(message);
}

// Branded confirm modal → resolves true/false. Falls back to native confirm.
export function appConfirm(message: string): Promise<boolean> {
  if (_confirm) return _confirm(message);
  if (typeof window !== "undefined") return Promise.resolve(window.confirm(message));
  return Promise.resolve(false);
}
