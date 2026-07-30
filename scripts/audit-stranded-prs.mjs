#!/usr/bin/env node
// Detect merged PRs whose content never reached the default branch.
//
// Why this exists
// ---------------
// A "merged" badge on GitHub only proves a PR merged into ITS OWN base. When
// PRs are stacked (PR B targets PR A's branch instead of main) and the parent
// merges first, the child's commits land on a branch that has already been
// merged away. They never reach main, both PRs still show as merged, and the
// loss is invisible until someone diffs the file tree by hand.
//
// That happened on 2026-07-23: PR #18 merged to main at 15:39:40Z, PR #19
// merged into #18's branch at 15:39:58Z. 13 commits were stranded for a week
// (recovered in PR #29). PR #24 hit the same trap and was rescued only by
// coincidence. This script makes the check mechanical.
//
// Usage:
//   node scripts/audit-stranded-prs.mjs            # human-readable report
//   node scripts/audit-stranded-prs.mjs --json     # machine-readable
//   node scripts/audit-stranded-prs.mjs --limit 50 # how many merged PRs to scan
//
// Requires: git, and the gh CLI authenticated with read access to the repo.
// Exit codes: 0 = nothing stranded, 1 = findings, 2 = could not run the audit.

import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const limitFlag = args.indexOf("--limit");
const LIMIT = limitFlag !== -1 ? Number(args[limitFlag + 1]) : 200;

function sh(cmd, cmdArgs) {
  return execFileSync(cmd, cmdArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

// Returns true/false without throwing on a non-zero exit.
function shOk(cmd, cmdArgs) {
  try {
    execFileSync(cmd, cmdArgs, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

let defaultBranch;
let prs;
try {
  defaultBranch = sh("gh", ["repo", "view", "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"]);
  prs = JSON.parse(
    sh("gh", [
      "pr", "list",
      "--state", "merged",
      "--limit", String(LIMIT),
      "--json", "number,title,baseRefName,headRefName,mergedAt,mergeCommit",
    ]),
  );
} catch (err) {
  console.error("Could not query the repository. Is the gh CLI installed and authenticated?");
  console.error(String(err.message || err).split("\n")[0]);
  process.exit(2);
}

// Compare against the remote ref, not a possibly-stale local branch.
const mainRef = shOk("git", ["rev-parse", "--verify", `origin/${defaultBranch}`])
  ? `origin/${defaultBranch}`
  : defaultBranch;

const findings = [];
const checked = [];

for (const pr of prs) {
  const oid = pr.mergeCommit?.oid;
  if (!oid) continue; // nothing to verify against

  const objectPresent = shOk("git", ["cat-file", "-e", `${oid}^{commit}`]);
  const stacked = pr.baseRefName !== defaultBranch;

  if (!objectPresent) {
    // Not in our clone at all. For a PR that merged into the default branch this
    // just means a shallow clone; for a stacked PR it is the stranded signature:
    // unreachable from every remote ref because the branch was deleted.
    if (stacked) {
      findings.push({
        number: pr.number,
        title: pr.title,
        head: pr.headRefName,
        base: pr.baseRefName,
        mergedAt: pr.mergedAt,
        mergeCommit: oid,
        reason: "merge commit is unreachable from any remote ref (branch deleted, content not in " + defaultBranch + ")",
      });
    }
    continue;
  }

  const inMain = shOk("git", ["merge-base", "--is-ancestor", oid, mainRef]);
  checked.push({ number: pr.number, inMain, stacked });

  if (!inMain) {
    findings.push({
      number: pr.number,
      title: pr.title,
      head: pr.headRefName,
      base: pr.baseRefName,
      mergedAt: pr.mergedAt,
      mergeCommit: oid,
      reason: `merged into "${pr.baseRefName}" but that content is not in ${defaultBranch}`,
    });
  }
}

if (asJson) {
  console.log(JSON.stringify({ defaultBranch, scanned: prs.length, verified: checked.length, findings }, null, 2));
  process.exit(findings.length ? 1 : 0);
}

console.log(`Scanned ${prs.length} merged PR(s) against ${mainRef}.`);

if (!findings.length) {
  console.log("No stranded PRs. Every merged PR's content is present in " + defaultBranch + ".");
  process.exit(0);
}

console.log(`\n${findings.length} merged PR(s) whose content is NOT in ${defaultBranch}:\n`);
for (const f of findings) {
  console.log(`  PR #${f.number} — ${f.title}`);
  console.log(`    ${f.head} -> ${f.base}, merged ${f.mergedAt}`);
  console.log(`    ${f.reason}`);
  console.log(`    recover with: git branch recovered/pr-${f.number} ${f.mergeCommit}`);
  console.log("");
}
console.log("If the merge commit is unreachable, the commits may still exist locally as");
console.log("unreferenced objects. Create the branch above BEFORE running any git gc.");
process.exit(1);
