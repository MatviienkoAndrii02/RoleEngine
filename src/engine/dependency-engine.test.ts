import test from "node:test";
import assert from "node:assert/strict";
import { DependencyEngine } from "@/engine/dependency-engine";
import type { CharacterNodeModel } from "@/domain/nodes";
import { diagnoseEffectReferences, type EffectDefinition } from "@/domain/effects";

const node = (id: string, value: number): CharacterNodeModel => ({ id, parentId: null, type: "NUMBER", name: id, path: id, order: 0, data: { value } });
const effect = (id: string, operation: EffectDefinition["operation"], target: string, source: EffectDefinition["source"]): EffectDefinition => ({ id, name: id, enabled: true, operation, priority: 0, condition: { kind: "always" }, target: { kind: "node", nodeId: target }, source });

test("flat bonuses are applied before percent bonuses", () => {
  const result = new DependencyEngine([node("strength", 10)], [effect("sword", "ADD", "strength", { kind: "number", value: 5 }), effect("talent", "PERCENT_BONUS", "strength", { kind: "number", value: 20 })]).evaluate();
  assert.equal(result.calculations.get("strength")?.final, 18);
});

test("lower priority number is applied earlier even across operation groups", () => {
  const result = new DependencyEngine(
    [node("strength", 10)],
    [
      { ...effect("late-add", "ADD", "strength", { kind: "number", value: 5 }), priority: 2 },
      { ...effect("early-multiply", "MULTIPLY", "strength", { kind: "number", value: 2 }), priority: 1 },
    ],
  ).evaluate();
  assert.equal(result.calculations.get("strength")?.final, 25);
});

test("same-priority effects use operation order set, add/subtract, then multipliers", () => {
  const result = new DependencyEngine(
    [node("strength", 10)],
    [
      effect("multiply", "MULTIPLY", "strength", { kind: "number", value: 2 }),
      effect("add", "ADD", "strength", { kind: "number", value: 3 }),
      { ...effect("set", "SET_BAR_MAX", "strength", { kind: "number", value: 20 }), payload: { numericField: "value" } },
      effect("subtract", "SUBTRACT", "strength", { kind: "number", value: 4 }),
      effect("percent", "PERCENT_BONUS", "strength", { kind: "number", value: 10 }),
    ],
  ).evaluate();
  assert.ok(Math.abs((result.calculations.get("strength")?.final ?? 0) - 41.8) < 0.000001);
});

test("formula sources are evaluated", () => {
  const result = new DependencyEngine([node("int", 4), node("mana", 10)], [effect("scaling", "ADD", "mana", { kind: "formula", expression: { kind: "multiply", left: { kind: "ref", nodeId: "int" }, right: { kind: "const", value: 2 } } })]).evaluate();
  assert.equal(result.calculations.get("mana")?.final, 18);
});

test("cycles are detected", () => {
  const result = new DependencyEngine([node("a", 1), node("b", 2)], [effect("ab", "ADD", "b", { kind: "node", nodeId: "a" }), effect("ba", "ADD", "a", { kind: "node", nodeId: "b" })]).evaluate();
  assert.equal(result.cycles.length, 1);
  assert.equal(result.calculations.size, 0);
});

test("effects referencing a deleted condition node are ignored safely", () => {
  const conditional: EffectDefinition = {
    ...effect("conditional", "ADD", "strength", { kind: "number", value: 5 }),
    condition: {
      kind: "compare",
      nodeId: "deleted-node",
      operator: "gt",
      value: { kind: "number", value: 0 }
    }
  };
  const result = new DependencyEngine([node("strength", 10)], [conditional]).evaluate();
  assert.equal(result.cycles.length, 0);
  assert.equal(result.calculations.get("strength")?.final, 10);
});

test("effects sourcing a deleted node are ignored safely", () => {
  const result = new DependencyEngine(
    [node("strength", 10)],
    [effect("missing-source", "ADD", "strength", { kind: "node", nodeId: "deleted-node" })]
  ).evaluate();
  assert.equal(result.calculations.get("strength")?.final, 10);
});

test("missing effect references are diagnosed across target, source and conditions", () => {
  const broken: EffectDefinition = {
    ...effect("broken", "ADD", "missing-target", { kind: "node", nodeId: "missing-source" }),
    condition: { kind: "fieldExists", nodeId: "missing-condition" },
  };
  assert.deepEqual(diagnoseEffectReferences(broken, []), {
    missingNodeIds: ["missing-target", "missing-source", "missing-condition"],
    missingPaths: [],
  });
});

test("structural requests are emitted without creating data in the engine", () => {
  const container: CharacterNodeModel = { id: "inventory", parentId: null, type: "CONTAINER", name: "Inventory", path: "inventory", order: 0, data: {} };
  const structural: EffectDefinition = { id: "create", name: "Create pouch", enabled: true, operation: "CREATE_NODE", priority: 0, condition: { kind: "always" }, target: { kind: "node", nodeId: "inventory" }, source: { kind: "number", value: 0 }, payload: { createNode: { type: "TEXT", name: "Pouch", data: { text: "" } } } };
  const result = new DependencyEngine([container], [structural]).evaluate();
  assert.equal(result.createdNodeRequests.length, 1);
  assert.equal(result.createdNodeRequests[0]?.effectId, "create");
});

test("structural effects can create nodes at the character root", () => {
  const structural: EffectDefinition = {
    id: "create-root",
    name: "Create root group",
    enabled: true,
    operation: "CREATE_GROUP",
    priority: 0,
    condition: { kind: "always" },
    target: { kind: "root" },
    source: { kind: "number", value: 0 },
    payload: { createNode: { type: "GROUP", name: "Root group", data: {} } },
  };
  const result = new DependencyEngine([], [structural]).evaluate();
  assert.equal(result.createdNodeRequests.length, 1);
  assert.equal(result.createdNodeRequests[0]?.parentNodeId, null);
});

test("patch effects are returned as derived patches", () => {
  const patchEffect: EffectDefinition = { id: "patch", name: "Raise cap", enabled: true, operation: "PATCH_NODE_PROPS", priority: 0, condition: { kind: "always" }, target: { kind: "node", nodeId: "strength" }, source: { kind: "number", value: 0 }, payload: { patch: { max: 20 } } };
  const result = new DependencyEngine([node("strength", 10)], [patchEffect]).evaluate();
  assert.deepEqual(result.patchRequests[0]?.patch, { max: 20 });
});

test("patch effects can derive Bar max from formula source", () => {
  const mana: CharacterNodeModel = { id: "mana", parentId: null, type: "BAR", name: "Mana", path: "mana", order: 0, data: { current: 5, max: 10 } };
  const intelligence = node("intelligence", 4);
  const patchEffect: EffectDefinition = {
    id: "patch-max",
    name: "Intelligence mana cap",
    enabled: true,
    operation: "PATCH_NODE_PROPS",
    priority: 0,
    condition: { kind: "always" },
    target: { kind: "node", nodeId: "mana" },
    source: {
      kind: "formula",
      expression: {
        kind: "multiply",
        left: { kind: "ref", nodeId: "intelligence" },
        right: { kind: "const", value: 10 },
      },
    },
    payload: { patch: {}, patchFromSource: { field: "max" } },
  };
  const result = new DependencyEngine([mana, intelligence], [patchEffect]).evaluate();
  assert.deepEqual(result.patchRequests[0]?.patch, { max: 40 });
});

test("patch effects can derive a non-max numeric field from a formula source", () => {
  const mana: CharacterNodeModel = { id: "mana", parentId: null, type: "BAR", name: "Mana", path: "mana", order: 0, data: { current: 5, min: 0, max: 10 } };
  const intelligence = node("intelligence", 4);
  const patchEffect: EffectDefinition = {
    id: "patch-min",
    name: "Intelligence mana floor",
    enabled: true,
    operation: "PATCH_NODE_PROPS",
    priority: 0,
    condition: { kind: "always" },
    target: { kind: "node", nodeId: "mana" },
    source: {
      kind: "formula",
      expression: {
        kind: "multiply",
        left: { kind: "ref", nodeId: "intelligence" },
        right: { kind: "const", value: 2 },
      },
    },
    payload: { patch: {}, patchFromSource: { field: "min" } },
  };
  const result = new DependencyEngine([mana, intelligence], [patchEffect]).evaluate();
  assert.deepEqual(result.patchRequests[0]?.patch, { min: 8 });
});

test("numeric effects can target Bar min and max fields", () => {
  const mana: CharacterNodeModel = { id: "mana", parentId: null, type: "BAR", name: "Mana", path: "mana", order: 0, data: { current: 5, min: 0, max: 10 } };
  const result = new DependencyEngine(
    [mana],
    [
      { ...effect("raise-min", "ADD", "mana", { kind: "number", value: 2 }), payload: { numericField: "min" } },
      { ...effect("set-max", "SET_BAR_MAX", "mana", { kind: "number", value: 40 }), payload: { numericField: "max" } },
    ],
  ).evaluate();
  assert.equal(result.calculations.get("mana:min")?.final, 2);
  assert.equal(result.calculations.get("mana:max")?.final, 40);
});
