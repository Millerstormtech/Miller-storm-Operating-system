// Every sentence Storm Bot says. PURE ONLY: no database, no I/O, no env reads.
// Unit-tested so the copy can never drift silently, because these lines go out
// to ~74 people's phones. Colons, commas and parentheses only: never em dashes
// (app-wide copy rule).

// Closer pools. Each event rotates through its own pool so a rep who files
// three claims in a week does not read the identical sentence three times.
// "Let's goo!🔥" is Youssef's original course line, kept as a pool member.
export const COURSE_CLOSERS = ["Let's goo!🔥", "Big steps!💪", "Locked in!🎯", "One more down!👊"];
export const CLAIM_CLOSERS = ["Keep it rolling!💪", "On to the next one!👊", "Momentum!⚡", "Storm's coming!⛈️"];
export const CONTRACT_CLOSERS = ["Big one!💪", "Get it!👏", "That's the way!🙌", "Signed and sealed!✍️"];

// Deterministic, NOT random: the same event always renders the same sentence.
// That is what lets the tests assert exact strings and keeps a re-read of the
// same job from producing different text.
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function pickCloser(pool: string[], seed: string): string {
  return pool[hashString(seed) % pool.length];
}

// Whole dollars with thousands separators. Cents on a roofing contract are noise.
export function formatAmount(dollars: number): string {
  return `$${Math.round(dollars).toLocaleString("en-US")}`;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function courseCelebrationMessage(
  name: string,
  courseTitle: string,
  done: number,
  total: number,
  seed: string
): string {
  const closer = pickCloser(COURSE_CLOSERS, seed);
  return `🎉 ${name.trim()} just passed the ${courseTitle.trim()} Course! That's ${done} of ${total} courses done. ${closer}`;
}

export function claimFiledMessage(name: string, monthCount: number, seed: string): string {
  const closer = pickCloser(CLAIM_CLOSERS, seed);
  const noun = plural(monthCount, "claim", "claims");
  return `📋 ${name.trim()} just filed a claim! That's ${monthCount} ${noun} this month. ${closer}`;
}

// amountDollars <= 0 means AccuLynx has no approved value on the job yet. Announce
// the win without inventing a number rather than posting "a $0 contract".
export function contractSignedMessage(
  name: string,
  monthCount: number,
  amountDollars: number,
  seed: string
): string {
  const closer = pickCloser(CONTRACT_CLOSERS, seed);
  const noun = plural(monthCount, "contract", "contracts");
  const tail = `That's ${monthCount} ${noun} this month. ${closer}`;
  if (amountDollars > 0) {
    return `💰 ${name.trim()} just signed a ${formatAmount(amountDollars)} contract! ${tail}`;
  }
  return `✍️ ${name.trim()} just signed a contract! ${tail}`;
}
