// Small input-sanitization helpers used by API routes.
// These are intentionally conservative so they do not change behaviour
// for normal/expected input — they only neutralise malicious input.

/**
 * Escape all regular-expression metacharacters in a string so it can be
 * embedded safely inside a `new RegExp(...)`. For a normal email such as
 * "john.doe@gmail.com" the matched text is unchanged; only crafted input
 * containing characters like `.* + ? ( ) [ ] \` is neutralised. This
 * prevents regex/ReDoS injection in `$regex` lookups.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build an exact, case-insensitive match condition for a field using an
 * escaped value. Equivalent in behaviour to the previous
 * `{ $regex: new RegExp(`^${value}$`, "i") }` for ordinary strings, but
 * safe against regex injection.
 */
export function exactCaseInsensitive(value: string) {
  return { $regex: new RegExp(`^${escapeRegex(value)}$`, "i") };
}

/**
 * Coerce a value that is expected to be a plain string. If the client sends
 * an object (e.g. `{ "$gt": "" }` to attempt NoSQL operator injection) this
 * returns an empty string instead of letting the object reach the query.
 * Arrays and objects are rejected; only string/number primitives pass.
 */
export function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Scalar identity fields. They must never be objects/arrays — an object here
// (e.g. { "$gt": "" }) is a NoSQL operator-injection attempt. Strings and
// numbers are still accepted, so existing/legitimate payloads are unaffected.
const SCALAR_FIELDS = ["email", "name", "phone", "role", "id", "managerId"];

/**
 * Conservative validation for the user create/edit endpoints.
 * - Rejects a non-object body.
 * - Rejects object/array values in scalar identity fields (operator injection).
 * - Rejects a malformed email *only when an email is actually provided*.
 * Everything else (arrays like `roles`, objects like `featureToggles`,
 * `publicProfile`, numbers, etc.) is left untouched so functionality is
 * preserved.
 */
export function validateUserPayload(
  payload: unknown
): { ok: true } | { ok: false; error: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "Invalid request body" };
  }
  const body = payload as Record<string, unknown>;

  for (const field of SCALAR_FIELDS) {
    const v = body[field];
    if (v !== undefined && v !== null && typeof v === "object") {
      return { ok: false, error: `Invalid value for '${field}'` };
    }
  }

  if (typeof body.email === "string" && body.email.trim() !== "") {
    if (!EMAIL_RE.test(body.email.trim())) {
      return { ok: false, error: "Invalid email format" };
    }
  }

  return { ok: true };
}
