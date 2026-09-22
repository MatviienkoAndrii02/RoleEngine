import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspectNodeRecord } from "@/domain/json-integrity";
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

  it("keeps repaired values that satisfy the domain schema", () => {
    const finding = inspectNodeRecord({
      entityType: "CharacterNode",
      type: "NUMBER",
      data: { value: "12", max: "20" },
    });

    assert.equal(finding.strategy, "repair");
    assert.ok(finding.repairedValue !== undefined);
    const parsed = parseCharacterNodeModels([
      {
        id: "repaired",
        parentId: null,
        type: "NUMBER",
        name: "Strength",
        path: "strength",
        order: 0,
        data: finding.repairedValue,
      },
    ]);
    assert.equal(parsed.diagnostics.length, 0);
    const repaired = parsed.nodes[0];
    if (!repaired || !("value" in repaired.data)) throw new Error("expected repaired number node");
    assert.equal(repaired.data.value, 12);
  });
});
