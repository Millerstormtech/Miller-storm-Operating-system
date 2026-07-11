// Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/leaderboard/repMatch.test.ts
import { test } from "node:test";
import assert from "node:assert";
import { matchRepsToUsers } from "./repMatch.ts";

test("matchRepsToUsers keys by app-user id, prefers app identity, drops unmatched", () => {
  const merged = [
    { email: "luke@ms.com", name: "Luke H (repcard)", verifiedKnocks: 10, filed: 2, won: 1, revenue: 1000 },
    { email: "ghost@ms.com", name: "Ghost Rep", verifiedKnocks: 5, filed: 0, won: 0, revenue: 0 }, // no app user
  ];
  const appUsers = [
    { id: "u_luke", email: "Luke@MS.com", name: "Luke Huber", managerId: "u_gunner" }, // mixed-case email
  ];

  const out = matchRepsToUsers(merged as any, appUsers as any);

  assert.strictEqual(out.length, 1, "the unmatched RepCard rep is dropped");
  assert.deepStrictEqual(out[0], {
    id: "u_luke",           // keyed by app user id (for the hierarchy tree)
    name: "Luke Huber",     // app identity wins over the RepCard snapshot
    managerId: "u_gunner",  // carried through so the tree can place them
    verifiedKnocks: 10, filed: 2, won: 1, revenue: 1000,
  });
});
