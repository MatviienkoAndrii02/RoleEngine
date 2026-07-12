import assert from "node:assert/strict";
import test from "node:test";
import { collectSubtreeIds } from "@/domain/tree";

test("collects every descendant by parent links", () => {
  const ids = collectSubtreeIds([
    { id: "root", parentId: null },
    { id: "child-a", parentId: "root" },
    { id: "child-b", parentId: "root" },
    { id: "grandchild", parentId: "child-a" },
    { id: "other-root", parentId: null },
  ], "root");

  assert.deepEqual(ids, ["root", "child-a", "child-b", "grandchild"]);
});

test("does not loop forever on malformed cycles", () => {
  const ids = collectSubtreeIds([
    { id: "a", parentId: "c" },
    { id: "b", parentId: "a" },
    { id: "c", parentId: "b" },
  ], "a");

  assert.deepEqual(ids, ["a", "b", "c"]);
});
