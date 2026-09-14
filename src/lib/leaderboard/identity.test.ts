// src/lib/leaderboard/identity.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { normEmail, normName, normPhone, hasAcculynxAccount, findSubmitterRow } from "./identity.ts";

test("normEmail lowercases + trims", () => {
  assert.equal(normEmail("  Alan.Bieberle@MillerStorm.com "), "alan.bieberle@millerstorm.com");
  assert.equal(normEmail(undefined), "");
});

test("normName lowercases, trims, collapses whitespace", () => {
  assert.equal(normName("  Fernando   Cano "), "fernando cano");
  assert.equal(normName(""), "");
});

test("normPhone reduces to 10 digits, drops US country code", () => {
  assert.equal(normPhone("(817) 897-6947"), "8178976947");
  assert.equal(normPhone("+1 817-897-6947"), "8178976947");
  assert.equal(normPhone("18178976947"), "8178976947");
  assert.equal(normPhone("12345"), "");        // too short -> unusable
  assert.equal(normPhone(undefined), "");
});

const acctSets = {
  emails: new Set(["ashton@millerstorm.com", "vic@millerstorm.com"]),
  phones: new Set(["2145550001"]),
  names: new Set(["victor gonzalez"]),
};

test("hasAcculynxAccount matches by email", () => {
  assert.equal(hasAcculynxAccount({ email: "vic@millerstorm.com" }, acctSets), true);
});
test("hasAcculynxAccount matches by phone when email misses", () => {
  assert.equal(hasAcculynxAccount({ email: "nope@x.com", phone: "2145550001" }, acctSets), true);
});
test("hasAcculynxAccount matches by name when email+phone miss", () => {
  assert.equal(hasAcculynxAccount({ email: "", phone: "", nameKey: "victor gonzalez" }, acctSets), true);
});
test("hasAcculynxAccount: no match on all three -> false (Ashton/Eduardo case)", () => {
  assert.equal(hasAcculynxAccount({ email: "eduardo@x.com", phone: "9995551234", nameKey: "eduardo ramos" }, acctSets), false);
});
test("hasAcculynxAccount: empty sets -> false (fresh deploy, before first sync)", () => {
  assert.equal(hasAcculynxAccount({ email: "vic@millerstorm.com" }, { emails: new Set(), phones: new Set(), names: new Set() }), false);
});
test("hasAcculynxAccount: blank rep fields never match", () => {
  assert.equal(hasAcculynxAccount({ email: "", phone: "", nameKey: "" }, acctSets), false);
});

const boardRows = [
  { repUserId: "u-james", name: "James Williams" },
  { repUserId: null, name: "Kyle Casas" },
  { repUserId: "u-alan", name: "Alan Bieberle" },
];

test("findSubmitterRow finds the rep by signed-in account even when the account name differs", () => {
  assert.equal(findSubmitterRow(boardRows, { userId: "u-james", name: "james" })?.name, "James Williams");
});

test("findSubmitterRow: the account wins over a name that points at someone else", () => {
  assert.equal(findSubmitterRow(boardRows, { userId: "u-alan", name: "James Williams" })?.name, "Alan Bieberle");
});

test("findSubmitterRow falls back to the name when the account links to no row", () => {
  assert.equal(findSubmitterRow(boardRows, { userId: "u-kyle", name: "  kyle   CASAS " })?.name, "Kyle Casas");
});

test("findSubmitterRow: no account match and no name match -> undefined", () => {
  assert.equal(findSubmitterRow(boardRows, { userId: "u-nobody", name: "james" }), undefined);
  assert.equal(findSubmitterRow(boardRows, { userId: "", name: "" }), undefined);
});

test("findSubmitterRow never matches a row with no account to a missing userId", () => {
  assert.equal(findSubmitterRow(boardRows, { userId: null, name: "" }), undefined);
});
