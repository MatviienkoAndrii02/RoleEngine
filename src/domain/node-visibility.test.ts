import test from "node:test";
import assert from "node:assert/strict";
import { removePlayerHiddenSubtrees, type NodeVisibilityRecord } from "@/domain/node-visibility";

test("removes hidden nodes and their descendants for player views", () => {
  const nodes: NodeVisibilityRecord[] = [
    { id: "visible-root", parentId: null, data: {} },
    { id: "hidden-root", parentId: null, data: { hiddenFromPlayer: true } },
    { id: "hidden-child", parentId: "hidden-root", data: {} },
    { id: "visible-child", parentId: "visible-root", data: {} },
  ];

  assert.deepEqual(removePlayerHiddenSubtrees(nodes).map((node) => node.id), ["visible-root", "visible-child"]);
});

test("keeps existing nodes visible when hiddenFromPlayer is absent", () => {
  const nodes: NodeVisibilityRecord[] = [
    { id: "root", parentId: null, data: {} },
    { id: "child", parentId: "root", data: { collapsedByDefault: true } },
  ];

  assert.deepEqual(removePlayerHiddenSubtrees(nodes).map((node) => node.id), ["root", "child"]);
});
