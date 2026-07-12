import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCharacterNodeModels, parseEffectDefinitions } from "@/server/read-models";

describe("read model parsers", () => {
  it("keeps valid nodes and reports invalid node data", () => {
    const result = parseCharacterNodeModels([
      {
        id: "valid",
        parentId: null,
        type: "NUMBER",
        name: "Strength",
        path: "strength",
        order: 0,
        data: { value: 10 },
      },
      {
        id: "invalid",
        parentId: null,
        type: "NUMBER",
        name: "Broken",
        path: "broken",
        order: 1,
        data: { value: "not-number" },
      },
    ]);

    assert.equal(result.nodes.length, 1);
    assert.equal(result.nodes[0]?.id, "valid");
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0]?.entityId, "invalid");
  });

  it("keeps valid effects and reports invalid effect DSL", () => {
    const result = parseEffectDefinitions([
      {
        id: "valid",
        name: "Sword",
        enabled: true,
        operation: "ADD",
        priority: 0,
        condition: { kind: "always" },
        target: { kind: "node", nodeId: "strength" },
        source: { kind: "number", value: 5 },
        payload: {},
      },
      {
        id: "invalid",
        name: "Broken",
        enabled: true,
        operation: "ADD",
        priority: 1,
        condition: { kind: "wat" },
        target: { kind: "node", nodeId: "strength" },
        source: { kind: "number", value: 5 },
        payload: {},
      },
    ]);

    assert.equal(result.effects.length, 1);
    assert.equal(result.effects[0]?.id, "valid");
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0]?.entityId, "invalid");
  });
});
