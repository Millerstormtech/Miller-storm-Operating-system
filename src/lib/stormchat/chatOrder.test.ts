import { describe, it, expect } from "vitest";
import { applyCustomOrder } from "./chatOrder";

const item = (id: string) => ({ _id: id });

describe("applyCustomOrder", () => {
  it("returns the list unchanged when there is no saved order", () => {
    const items = [item("a"), item("b"), item("c")];
    expect(applyCustomOrder(items, undefined)).toEqual(items);
    expect(applyCustomOrder(items, null)).toEqual(items);
    expect(applyCustomOrder(items, [])).toEqual(items);
  });

  it("reorders items to match the saved order exactly when it covers everyone", () => {
    const items = [item("a"), item("b"), item("c")];
    const result = applyCustomOrder(items, ["c", "a", "b"]);
    expect(result.map((i) => i._id)).toEqual(["c", "a", "b"]);
  });

  it("appends items missing from the saved order after everything that IS ordered", () => {
    // "d" and "e" are new chats the rep never manually placed.
    const items = [item("a"), item("b"), item("c"), item("d"), item("e")];
    const result = applyCustomOrder(items, ["c", "a"]);
    expect(result.map((i) => i._id)).toEqual(["c", "a", "b", "d", "e"]);
  });

  it("keeps the unordered remainder in its original (recency) relative order", () => {
    // b, d, e arrive already recency-sorted; only c and a were manually placed.
    const items = [item("b"), item("d"), item("c"), item("e"), item("a")];
    const result = applyCustomOrder(items, ["a", "c"]);
    expect(result.map((i) => i._id)).toEqual(["a", "c", "b", "d", "e"]);
  });

  it("ignores a saved id that no longer exists in the current list", () => {
    // The chat was deleted/hidden since the order was saved — it should not
    // conjure a phantom entry or break the rest of the ordering.
    const items = [item("a"), item("b")];
    const result = applyCustomOrder(items, ["ghost", "b", "a"]);
    expect(result.map((i) => i._id)).toEqual(["b", "a"]);
  });

  it("handles a saved order of a single item among many", () => {
    const items = [item("a"), item("b"), item("c")];
    const result = applyCustomOrder(items, ["b"]);
    expect(result.map((i) => i._id)).toEqual(["b", "a", "c"]);
  });

  it("is a no-op when the saved order exactly matches the current order already", () => {
    const items = [item("a"), item("b"), item("c")];
    const result = applyCustomOrder(items, ["a", "b", "c"]);
    expect(result.map((i) => i._id)).toEqual(["a", "b", "c"]);
  });
});
