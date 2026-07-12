import assert from "node:assert/strict";
import test from "node:test";
import {
  characterAssignmentCommandSchema,
  addWorkspaceMemberCommandSchema,
  createEffectCommandSchema,
  createNodeCommandSchema,
  createWorkspaceCommandSchema,
  parseNodeData,
  removeWorkspaceMemberCommandSchema,
  registerAccountCommandSchema,
  selectWorkspaceCommandSchema,
  updateWorkspaceMemberCommandSchema,
  updateNodeCommandSchema,
  updateEffectCommandSchema,
  updateCharacterCommandSchema,
} from "@/domain/validation";

test("accepts valid Unicode number node data", () => {
  const result = createNodeCommandSchema.parse({
    parentId: null,
    type: "NUMBER",
    name: "Сила",
    data: { value: 10, min: 0, max: 20, allowNegative: false, description: "Базова сила" },
  });

  assert.equal(result.name, "Сила");
  assert.ok("value" in result.data);
  assert.equal(result.data.value, 10);
});

test("rejects node data that does not match its type", () => {
  assert.throws(() => createNodeCommandSchema.parse({
    type: "BAR",
    name: "Здоров'я",
    data: { value: 10 },
  }));
  assert.throws(() => parseNodeData("NUMBER", { value: -1, allowNegative: false }));
  assert.throws(() => parseNodeData("NUMBER", { value: 10, min: 20, max: 5 }));
});

test("validates optional node icons", () => {
  assert.doesNotThrow(() => parseNodeData("NUMBER", { value: 10, icon: "swords" }));
  assert.doesNotThrow(() => parseNodeData("BAR", { current: 1, min: 0, max: 3, icon: "heart" }));
  assert.doesNotThrow(() => parseNodeData("TEXT", { text: "Нотатки", icon: "book" }));
  assert.throws(() => parseNodeData("BAR", { current: 1, max: 3, icon: "custom-uploaded-icon" }));
  assert.throws(() => parseNodeData("BAR", { current: 1, min: 5, max: 3 }));
});

test("validates table columns and typed cells", () => {
  assert.doesNotThrow(() => parseNodeData("TABLE", {
    columns: [
      { id: "name", label: "Назва", type: "text" },
      { id: "weight", label: "Вага", type: "number" },
      { id: "equipped", label: "Одягнено", type: "boolean" },
      { id: "durability", label: "Міцність", type: "bar" },
    ],
    rows: [{ name: "Меч", weight: 2.5, equipped: true, durability: { current: 8, max: 10 } }],
  }));

  assert.throws(() => parseNodeData("TABLE", {
    columns: [{ id: "weight", label: "Вага", type: "number" }],
    rows: [{ weight: "важкий" }],
  }));
  assert.throws(() => parseNodeData("TABLE", {
    columns: [{ id: "name", label: "Назва", type: "text" }],
    rows: [{ unknown: "value" }],
  }));
  assert.throws(() => parseNodeData("TABLE", {
    columns: [
      { id: "name", label: "Назва", type: "text" },
      { id: "name", label: "Дублікат", type: "text" },
    ],
    rows: [],
  }));
});

test("rejects empty updates and unknown fields", () => {
  assert.throws(() => updateNodeCommandSchema.parse({}));
  assert.throws(() => updateNodeCommandSchema.parse({ name: "Valid", characterId: "spoofed" }));
  assert.equal(updateNodeCommandSchema.parse({ parentId: null }).parentId, null);
  assert.equal(updateNodeCommandSchema.parse({ parentId: "new_parent" }).parentId, "new_parent");
});

test("validates character settings updates", () => {
  assert.doesNotThrow(() => updateCharacterCommandSchema.parse({ name: "Нове ім'я", description: null, ownerId: null }));
  assert.doesNotThrow(() => updateCharacterCommandSchema.parse({ ownerId: "player_id" }));
  assert.throws(() => updateCharacterCommandSchema.parse({}));
  assert.throws(() => updateCharacterCommandSchema.parse({ name: "" }));
  assert.throws(() => updateCharacterCommandSchema.parse({ ownerId: "" }));
});

test("validates character assignment commands", () => {
  assert.doesNotThrow(() => characterAssignmentCommandSchema.parse({ userId: "player_id" }));
  assert.throws(() => characterAssignmentCommandSchema.parse({}));
  assert.throws(() => characterAssignmentCommandSchema.parse({ userId: "" }));
  assert.throws(() => characterAssignmentCommandSchema.parse({ userId: "player_id", canEdit: true }));
});

test("validates recursive conditions and formulas", () => {
  const result = createEffectCommandSchema.parse({
    name: "Scaled strength",
    operation: "PERCENT_BONUS",
    targetNodeId: "strength",
    source: {
      kind: "formula",
      expression: {
        kind: "multiply",
        left: { kind: "ref", nodeId: "level", field: "value" },
        right: { kind: "const", value: 2 },
      },
    },
    condition: {
      kind: "and",
      conditions: [
        { kind: "fieldExists", nodeId: "level" },
        { kind: "not", condition: { kind: "fieldExists", nodeId: "curse" } },
      ],
    },
  });

  assert.equal(result.operation, "PERCENT_BONUS");
});

test("rejects invalid structural node payload", () => {
  assert.throws(() => createEffectCommandSchema.parse({
    name: "Create invalid resource",
    operation: "CREATE_NODE",
    targetNodeId: "resources",
    condition: { kind: "always" },
    createNode: { type: "BAR", name: "Rage", data: { current: 0 } },
  }));
});

test("accepts a structural effect targeting the character root", () => {
  const result = createEffectCommandSchema.parse({
    name: "Create root group",
    operation: "CREATE_GROUP",
    targetNodeId: null,
    condition: { kind: "always" },
    createNode: { type: "GROUP", name: "Root group", data: {} },
  });
  assert.equal(result.targetNodeId, null);
});

test("accepts a numeric effect targeting a non-default numeric field", () => {
  const result = createEffectCommandSchema.parse({
    name: "Mana cap from intelligence",
    operation: "SET_BAR_MAX",
    targetNodeId: "mana",
    numericField: "max",
    source: {
      kind: "formula",
      expression: {
        kind: "multiply",
        left: { kind: "ref", nodeId: "intelligence", field: "value" },
        right: { kind: "const", value: 10 },
      },
    },
    condition: { kind: "always" },
  });
  assert.equal(result.operation, "SET_BAR_MAX");
  assert.equal(result.numericField, "max");
});

test("accepts a numeric effect targeting Bar min", () => {
  const result = createEffectCommandSchema.parse({
    name: "Mana floor from intelligence",
    operation: "SET_BAR_MAX",
    targetNodeId: "mana",
    numericField: "min",
    source: {
      kind: "formula",
      expression: {
        kind: "multiply",
        left: { kind: "ref", nodeId: "intelligence", field: "value" },
        right: { kind: "const", value: 2 },
      },
    },
    condition: { kind: "always" },
  });
  assert.equal(result.operation, "SET_BAR_MAX");
  assert.equal(result.numericField, "min");
});

test("accepts dynamic structural patch with complex conditions", () => {
  const result = createEffectCommandSchema.parse({
    name: "Dynamic mana description",
    operation: "PATCH_NODE_PROPS",
    targetNodeId: "mana",
    source: {
      kind: "formula",
      expression: {
        kind: "multiply",
        left: { kind: "ref", nodeId: "intelligence", field: "value" },
        right: { kind: "const", value: 10 },
      },
    },
    condition: {
      kind: "and",
      conditions: [
        {
          kind: "compare",
          nodeId: "intelligence",
          operator: "gt",
          value: { kind: "number", value: 0 },
        },
        {
          kind: "not",
          condition: { kind: "fieldExists", nodeId: "anti_magic" },
        },
      ],
    },
    patch: {},
    patchFromSource: { field: "max" },
  });
  assert.equal(result.operation, "PATCH_NODE_PROPS");
  assert.equal(result.condition.kind, "and");
});

test("accepts a full effect replacement", () => {
  const result = updateEffectCommandSchema.parse({
    name: "Retargeted bonus",
    enabled: true,
    priority: 4,
    operation: "ADD",
    targetNodeId: "strength",
    source: { kind: "node", nodeId: "level", field: "value" },
    condition: { kind: "always" },
  });
  assert.ok("operation" in result);
  assert.equal(result.operation, "ADD");
});

test("validates workspace commands", () => {
  assert.equal(createWorkspaceCommandSchema.parse({ name: "West Marches" }).name, "West Marches");
  assert.equal(selectWorkspaceCommandSchema.parse({ workspaceId: "workspace_1" }).workspaceId, "workspace_1");
  assert.throws(() => createWorkspaceCommandSchema.parse({ name: "" }));
  assert.throws(() => selectWorkspaceCommandSchema.parse({ workspaceId: "" }));
});

test("validates workspace member commands", () => {
  const added = addWorkspaceMemberCommandSchema.parse({
    workspaceId: "workspace_1",
    identifier: " PLAYER@ROLE.LOCAL ",
    role: "PLAYER",
  });
  assert.equal(added.identifier, "player@role.local");
  assert.equal(addWorkspaceMemberCommandSchema.parse({
    workspaceId: "workspace_1",
    identifier: " Player_One ",
    role: "PLAYER",
  }).identifier, "player_one");
  assert.equal(updateWorkspaceMemberCommandSchema.parse({
    workspaceId: "workspace_1",
    membershipId: "membership_1",
    role: "GM",
  }).role, "GM");
  assert.equal(removeWorkspaceMemberCommandSchema.parse({
    workspaceId: "workspace_1",
    membershipId: "membership_1",
  }).membershipId, "membership_1");
  assert.throws(() => addWorkspaceMemberCommandSchema.parse({ workspaceId: "workspace_1", identifier: "no", role: "PLAYER" }));
  assert.throws(() => updateWorkspaceMemberCommandSchema.parse({ workspaceId: "", membershipId: "membership_1", role: "GM" }));
  assert.throws(() => removeWorkspaceMemberCommandSchema.parse({ workspaceId: "workspace_1", membershipId: "" }));
});

test("registration username preserves case while validating allowed characters", () => {
  const parsed = registerAccountCommandSchema.parse({
    name: "Mira",
    email: " MIRA@ROLE.LOCAL ",
    username: "Mira_Vale",
    password: "demo1234",
  });
  assert.equal(parsed.email, "mira@role.local");
  assert.equal(parsed.username, "Mira_Vale");
  assert.throws(() => registerAccountCommandSchema.parse({
    email: "bad@role.local",
    username: "Міра",
    password: "demo1234",
  }));
});
