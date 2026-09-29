import { describe, it, expect } from "vitest";
import {
  type FolderNode,
  indexFolders,
  effectiveParentId,
  childFolders,
  pathTo,
  subtreeIds,
  canMoveFolder,
  folderOptions,
  relativeDirs,
  cleanName,
} from "./folderTree";

//  HR
//  ├── 2024
//  │   └── Offer letters
//  └── Policies
//  Sales
//  orphan  (parent "gone" no longer exists)
const F: FolderNode[] = [
  { id: "hr", name: "HR", parentId: null },
  { id: "y24", name: "2024", parentId: "hr" },
  { id: "offers", name: "Offer letters", parentId: "y24" },
  { id: "pol", name: "Policies", parentId: "hr" },
  { id: "sales", name: "Sales", parentId: null },
  { id: "orphan", name: "Orphan", parentId: "gone" },
];
const byId = indexFolders(F);

describe("folder tree", () => {
  it("lists a level's folders by name, treating a folder with a missing parent as top-level", () => {
    expect(childFolders(F, byId, null).map((f) => f.id)).toEqual(["hr", "orphan", "sales"]);
    expect(childFolders(F, byId, "hr").map((f) => f.id)).toEqual(["y24", "pol"]);
    expect(childFolders(F, byId, "offers")).toEqual([]);
  });

  it("sorts numbered names naturally", () => {
    const nums = ["Week 10", "Week 2", "Week 1"].map((name, i) => ({ id: `w${i}`, name, parentId: null }));
    expect(childFolders(nums, indexFolders(nums), null).map((f) => f.name)).toEqual(["Week 1", "Week 2", "Week 10"]);
  });

  it("maps a missing folder id to the top level", () => {
    expect(effectiveParentId("gone", byId)).toBeNull();
    expect(effectiveParentId(null, byId)).toBeNull();
    expect(effectiveParentId("y24", byId)).toBe("y24");
  });

  it("builds the breadcrumb path from the top", () => {
    expect(pathTo("offers", byId).map((f) => f.name)).toEqual(["HR", "2024", "Offer letters"]);
    expect(pathTo(null, byId)).toEqual([]);
  });

  it("survives a cycle in bad data", () => {
    const loop: FolderNode[] = [
      { id: "a", name: "A", parentId: "b" },
      { id: "b", name: "B", parentId: "a" },
    ];
    expect(pathTo("a", indexFolders(loop)).map((f) => f.id)).toEqual(["b", "a"]);
    expect([...subtreeIds("a", loop)].sort()).toEqual(["a", "b"]);
  });

  it("collects a folder's whole subtree", () => {
    expect([...subtreeIds("hr", F)].sort()).toEqual(["hr", "offers", "pol", "y24"]);
    expect([...subtreeIds("sales", F)]).toEqual(["sales"]);
  });

  it("refuses to move a folder into itself or its own subfolder", () => {
    expect(canMoveFolder("hr", "hr", F)).toBe(false);
    expect(canMoveFolder("hr", "offers", F)).toBe(false);
    expect(canMoveFolder("hr", "missing", F)).toBe(false);
    expect(canMoveFolder("offers", "sales", F)).toBe(true);
    expect(canMoveFolder("offers", null, F)).toBe(true);
  });

  it("lists every folder in tree order with its full path", () => {
    expect(folderOptions(F).map((o) => [o.label, o.depth])).toEqual([
      ["HR", 0],
      ["HR › 2024", 1],
      ["HR › 2024 › Offer letters", 2],
      ["HR › Policies", 1],
      ["Orphan", 0],
      ["Sales", 0],
    ]);
  });

  it("reads the folder chain out of a folder-pick path", () => {
    expect(relativeDirs("offer letter/2024/Dipak.pdf")).toEqual(["offer letter", "2024"]);
    expect(relativeDirs("offer letter/Dipak.pdf")).toEqual(["offer letter"]);
    expect(relativeDirs("Dipak.pdf")).toEqual([]);
    expect(relativeDirs("")).toEqual([]);
  });

  it("cleans names and refuses empty ones", () => {
    expect(cleanName("  Offer   letters \n")).toBe("Offer letters");
    expect(cleanName("   ")).toBeNull();
    expect(cleanName(42)).toBeNull();
    expect(cleanName("x".repeat(300))!.length).toBe(120);
  });
});
