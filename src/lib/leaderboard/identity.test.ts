// src/lib/leaderboard/identity.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { normEmail, normName, normPhone, hasAcculynxAccount } from "./identity.ts";

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
