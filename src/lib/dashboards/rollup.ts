// Pure, dependency-free rollup math for the role dashboards.
// Turns a flat list of people (adjacency list via managerId) + per-rep metrics
// into the self / team / branch / company slices each leader's dashboard shows.

export type Metrics = { verifiedKnocks: number; filed: number; won: number; revenue: number };
export type Rep = Metrics & { id: string; name?: string; managerId?: string };
export type Person = { id: string; name: string; role: string; roles?: string[]; managerId?: string };

const KEYS: (keyof Metrics)[] = ["verifiedKnocks", "filed", "won", "revenue"];
export const ZERO: Metrics = { verifiedKnocks: 0, filed: 0, won: 0, revenue: 0 };

/** Add up the four metrics across any list of metric-bearing rows. */
export function sumMetrics(rows: Metrics[]): Metrics {
  return rows.reduce((acc, r) => {
    const out = { ...acc };
    KEYS.forEach((k) => { out[k] += r[k] || 0; });
    return out;
  }, { ...ZERO });
}

/** managerId -> [child ids]. Roots collect under the "" (empty) key. */
export function buildTree(people: Person[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  people.forEach((p) => {
    const boss = p.managerId || "";
    if (!m.has(boss)) m.set(boss, []);
    m.get(boss)!.push(p.id);
  });
  return m;
}

/** Every id in the subtree rooted at `root`, including `root` itself. */
export function subtreeIds(root: string, tree: Map<string, string[]>): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const id = stack.pop()!;
    out.push(id);
    (tree.get(id) || []).forEach((c) => stack.push(c));
  }
  return out;
}

export type Rollup = { self: Metrics; team: Metrics; branch: Metrics; company: Metrics };

/** Keep only the four numeric fields (strip id/name/etc. off a Rep). */
function onlyMetrics(m: Metrics): Metrics {
  return { verifiedKnocks: m.verifiedKnocks || 0, filed: m.filed || 0, won: m.won || 0, revenue: m.revenue || 0 };
}

/** Climb managerId until the first branch_manager (inclusive). null if none. */
function nearestBranchRoot(personId: string, byId: Map<string, Person>): string | null {
  let cur = byId.get(personId);
  let guard = 0;
  while (cur && guard++ < 50) {
    if (cur.role === "branch_manager") return cur.id;
    if (!cur.managerId) return null;
    cur = byId.get(cur.managerId);
  }
  return null;
}

/**
 * The four dashboard slices for one person, from the flat people list + per-rep metrics:
 *  - self:    the person's own selling numbers (ZERO if they don't sell)
 *  - team:    self + their DIRECT rep reports (a team lead's team; a branch mgr's own team)
 *  - branch:  the whole subtree of the nearest branch_manager ancestor (else falls back to company)
 *  - company: every rep with metrics — the transparent board total
 */
export function rollupFor(personId: string, people: Person[], reps: Rep[]): Rollup {
  const tree = buildTree(people);
  const byId = new Map(people.map((p) => [p.id, p]));
  const metricById = new Map(reps.map((r) => [r.id, onlyMetrics(r)]));
  const sumIds = (ids: string[]): Metrics =>
    sumMetrics(ids.map((id) => metricById.get(id)).filter(Boolean) as Metrics[]);

  const self = metricById.get(personId) ? { ...metricById.get(personId)! } : { ...ZERO };

  const directRepChildren = (tree.get(personId) || []).filter((cid) => byId.get(cid)?.role === "sales_rep");
  const team = sumIds([personId, ...directRepChildren]);

  const company = sumMetrics(reps);
  const branchRoot = nearestBranchRoot(personId, byId);
  const branch = branchRoot ? sumIds(subtreeIds(branchRoot, tree)) : company;

  return { self, team, branch, company };
}
