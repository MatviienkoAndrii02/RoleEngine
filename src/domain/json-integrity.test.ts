import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inspectAuditRecord,
  inspectEffectRecord,
  inspectJsonObjectField,
  inspectNodeData,
  inspectNodeRecord,
  inspectNodeTypeArrayField,
  type JsonIntegrityFinding,
} from "@/domain/json-integrity";

function repairValue(finding: JsonIntegrityFinding) {
  assert.equal(finding.strategy, "repair", `expected a repairable finding, received ${finding.strategy}: ${finding.issues.join("; ")}`);
  return finding.repairedValue as Record<string, unknown>;
}

function assertQuarantined(finding: JsonIntegrityFinding) {
  assert.equal(finding.strategy, "quarantine", `expected quarantine, received ${finding.strategy}`);
  assert.equal(finding.repairedValue, undefined);
  assert.ok(finding.issues.length > 0);
}

describe("json integrity node policy", () => {
  it("accepts normalized node data for every node type", () => {
    const validData: Array<[Parameters<typeof inspectNodeData>[0], unknown]> = [
      ["NUMBER", { value: 3, min: 0, max: 5 }],
      ["BAR", { current: 2, max: 4 }],
      ["TEXT", { text: "note" }],
      ["TABLE", { columns: [{ id: "c1", label: "Cost", type: "number" }], rows: [{ c1: 4 }] }],
      ["CONTAINER", {}],
      ["GROUP", { color: "blue" }],
      ["LINK", { targetKind: "node", targetNodeId: "node_1" }],
    ];

    for (const [type, data] of validData) {
      assert.equal(inspectNodeData(type, data).strategy, "valid", `type ${type} should be valid`);
    }
  });

  it("coerces numeric strings and inserts missing defaults", () => {
    const coerced = inspectNodeData("NUMBER", { value: "7" });
    assert.deepEqual(coerced.repairs, ["COERCED_NUMBER"]);
    assert.equal(repairValue(coerced).value, 7);

    const defaulted = inspectNodeData("NUMBER", {});
    assert.deepEqual(defaulted.repairs, ["ADDED_DEFAULT_VALUE"]);
    assert.equal(repairValue(defaulted).value, 0);
  });

  it("drops unknown and invalid properties without inventing data", () => {
    const finding = inspectNodeData("NUMBER", { value: 1, strength: 4, icon: "not-an-icon", description: 7 });
    const repaired = repairValue(finding);
    assert.equal(repaired.strength, undefined);
    assert.equal(repaired.icon, undefined);
    assert.equal(repaired.description, undefined);
    assert.ok(finding.repairs.includes("DROPPED_UNKNOWN_PROPERTY"));
    assert.ok(finding.repairs.includes("DROPPED_INVALID_PROPERTY"));
  });

  it("keeps negative values by relaxing allowNegative instead of clamping", () => {
    const finding = inspectNodeData("NUMBER", { value: -5 });
    const repaired = repairValue(finding);
    assert.equal(repaired.value, -5);
    assert.equal(repaired.allowNegative, true);
    assert.deepEqual(finding.repairs, ["ENABLED_ALLOW_NEGATIVE"]);
  });

  it("drops a bound that contradicts the other bound", () => {
    const finding = inspectNodeData("NUMBER", { value: 2, min: 10, max: 5 });
    const repaired = repairValue(finding);
    assert.equal(repaired.min, undefined);
    assert.equal(repaired.max, 5);
    assert.deepEqual(finding.repairs, ["DROPPED_CONFLICTING_BOUND"]);
  });

  it("quarantines node data that cannot be normalized", () => {
    assertQuarantined(inspectNodeData("NUMBER", { value: "many" }));
    assertQuarantined(inspectNodeData("TEXT", { text: 5 }));
    assertQuarantined(inspectNodeData("BAR", {}));
    assertQuarantined(inspectNodeData("LINK", { targetKind: "wat", targetNodeId: "n1" }));
    assertQuarantined(inspectNodeData("TABLE", { columns: "nope", rows: [] }));
    assertQuarantined(inspectNodeData("CONTAINER", "nope"));
  });

  it("derives a Bar max and drops duplicate or invalid table columns", () => {
    const bar = inspectNodeData("BAR", { current: "3" });
    const repairedBar = repairValue(bar);
    assert.equal(repairedBar.current, 3);
    assert.equal(repairedBar.max, 3);
    assert.ok(bar.repairs.includes("DERIVED_BAR_MAX"));

    const table = inspectNodeData("TABLE", {
      columns: [
        { id: "c1", label: "Cost", type: "number" },
        { id: "c1", label: "Copy", type: "number" },
        { id: "bad" },
      ],
      rows: [{ c1: 2, ghost: 1, c1bad: "x" }, "nope"],
    });
    const repairedTable = repairValue(table);
    assert.deepEqual(repairedTable.columns, [{ id: "c1", label: "Cost", type: "number" }]);
    assert.deepEqual(repairedTable.rows, [{ c1: 2 }]);
    assert.ok(table.repairs.includes("DROPPED_DUPLICATE_COLUMN"));
    assert.ok(table.repairs.includes("DROPPED_INVALID_COLUMN"));
    assert.ok(table.repairs.includes("DROPPED_UNKNOWN_TABLE_COLUMN"));
    assert.ok(table.repairs.includes("DROPPED_INVALID_TABLE_ROW"));
  });

  it("quarantines an unreadable generated-node provenance bag", () => {
    assertQuarantined(inspectNodeRecord({
      entityType: "CharacterNode",
      type: "NUMBER",
      data: { value: 1 },
      computed: "broken",
    }));

    assert.equal(inspectNodeRecord({
      entityType: "TemplateNode",
      type: "NUMBER",
      data: { value: 1 },
      computed: "ignored",
    }).strategy, "valid");

    assertQuarantined(inspectNodeRecord({ entityType: "CharacterNode", type: "UNKNOWN", data: {} }));
  });
});

describe("json integrity effect and metadata policy", () => {
  const validEffect = {
    id: "effect_1",
    name: "Bonus",
    enabled: true,
    operation: "ADD",
    priority: 0,
    condition: { kind: "always" },
    target: { kind: "node", nodeId: "node_1" },
    source: { kind: "number", value: 2 },
    payload: {},
  };

  it("treats an empty effect payload as a read-time default", () => {
    assert.equal(inspectEffectRecord(validEffect).strategy, "valid");
  });

  it("quarantines broken effect rules without rewriting them", () => {
    const broken = inspectEffectRecord({ ...validEffect, condition: { kind: "wat" } });
    assertQuarantined(broken);
    assert.ok(broken.repairs.length === 0);

    assertQuarantined(inspectEffectRecord({ ...validEffect, operation: "TELEPORT" }));
    assertQuarantined(inspectEffectRecord({ ...validEffect, target: { kind: "node" } }));
  });

  it("treats audit metadata as append-only: report only, never rewrite", () => {
    assert.equal(inspectAuditRecord({ entityType: "CharacterNode", metadata: {} }).strategy, "valid");
    const broken = inspectAuditRecord({ entityType: "CharacterNode", metadata: ["not", "an", "object"] });
    assertQuarantined(broken);
    assert.deepEqual(broken.repairs, []);
    assertQuarantined(inspectAuditRecord({ entityType: "  ", metadata: {} }));
  });

  it("repairs open JSON object columns by resetting them to an empty object", () => {
    assert.equal(inspectJsonObjectField("metadata", { legacy: true }).strategy, "valid");
    const finding = inspectJsonObjectField("metadata", [1, 2]);
    assert.deepEqual(finding.repairs, ["RESET_NON_OBJECT_JSON_FIELD"]);
    assert.deepEqual(finding.repairedValue, {});
  });

  it("filters unsupported node type lists and quarantines empty results", () => {
    assert.equal(inspectNodeTypeArrayField("acceptedTypes", ["NUMBER", "BAR"]).strategy, "valid");

    const filtered = inspectNodeTypeArrayField("acceptedTypes", ["NUMBER", "WIZARD"]);
    assert.deepEqual(filtered.repairs, ["FILTERED_INVALID_ENUM_VALUE"]);
    assert.deepEqual(filtered.repairedValue, ["NUMBER"]);

    assertQuarantined(inspectNodeTypeArrayField("acceptedTypes", ["WIZARD"]));
    assertQuarantined(inspectNodeTypeArrayField("acceptedTypes", "NUMBER"));
  });
});

