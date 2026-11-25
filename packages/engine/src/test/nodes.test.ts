import assert from "node:assert/strict";
import { test } from "node:test";
import { CORE_IF, CORE_NODE_DEFINITIONS, CORE_SET_VARIABLE, isPropertyValueOfType, TYPES } from "../index.js";

test("core registry exposes variable and branch definitions", () => {
  assert.ok(CORE_NODE_DEFINITIONS.get(CORE_SET_VARIABLE.definitionId));
  assert.ok(CORE_NODE_DEFINITIONS.get(CORE_IF.definitionId));
  assert.deepEqual(
    CORE_IF.outputs.map((port) => port.id),
    ["exec-true", "exec-false"],
  );
});

test("operator properties accept only declared enum values", () => {
  const operator = CORE_IF.properties.find((property) => property.key === "operator");
  assert.ok(operator);
  assert.equal(isPropertyValueOfType("equals", operator.type, operator.enumValues), true);
  assert.equal(isPropertyValueOfType("greaterThan", operator.type, operator.enumValues), false);
  assert.equal(isPropertyValueOfType(42, TYPES.string, operator.enumValues), false);
});
