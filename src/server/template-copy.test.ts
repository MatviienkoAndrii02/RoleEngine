import assert from "node:assert/strict";
import test from "node:test";
import { remapTemplateEffectJson } from "@/server/template-copy";

test("remaps template effect node references in nested JSON", () => {
  const result = remapTemplateEffectJson({
    target: { kind: "node", nodeId: "tpl_strength" },
    source: {
      kind: "formula",
      expression: {
        kind: "add",
        left: { kind: "ref", nodeId: "tpl_level" },
        right: { kind: "const", value: 2 },
      },
    },
    condition: {
      kind: "and",
      conditions: [
        { kind: "fieldExists", nodeId: "tpl_strength" },
        { kind: "compare", nodeId: "external_missing", operator: "gt", value: { kind: "number", value: 0 } },
      ],
    },
    payload: { parentNodeId: "tpl_bag" },
  }, new Map([
    ["tpl_strength", "char_strength"],
    ["tpl_level", "char_level"],
    ["tpl_bag", "char_bag"],
  ]));

  assert.deepEqual(result, {
    target: { kind: "node", nodeId: "char_strength" },
    source: {
      kind: "formula",
      expression: {
        kind: "add",
        left: { kind: "ref", nodeId: "char_level" },
        right: { kind: "const", value: 2 },
      },
    },
    condition: {
      kind: "and",
      conditions: [
        { kind: "fieldExists", nodeId: "char_strength" },
        { kind: "compare", nodeId: "external_missing", operator: "gt", value: { kind: "number", value: 0 } },
      ],
    },
    payload: { parentNodeId: "char_bag" },
  });
});
