import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { lowerGraph, parseGraphDocument, type GraphDocument, type IrConditional, type IrVariableDeclaration } from "../index.js";

function loadBranchingGraph(): GraphDocument {
  const json = JSON.parse(readFileSync(new URL("../../../../fixtures/graph-branching.json", import.meta.url), "utf8")) as unknown;
  const loaded = parseGraphDocument(json);
  assert.ok(loaded.value);
  return loaded.value;
}

test("lowering produces a variable declaration with provenance", () => {
  const result = lowerGraph(loadBranchingGraph());
  assert.ok(result.value);
  const variable = result.value.functions[0]?.body.find((statement) => statement.kind === "variable") as IrVariableDeclaration | undefined;
  assert.equal(variable?.name, "status");
  assert.deepEqual(variable?.value, { kind: "string", value: "yes" });
  assert.deepEqual(variable?.origin, { graphId: "example.branching", nodeId: "set-1" });
});

test("lowering produces both conditional branches", () => {
  const result = lowerGraph(loadBranchingGraph());
  assert.ok(result.value);
  const conditional = result.value.functions[0]?.body.find((statement) => statement.kind === "conditional") as IrConditional | undefined;
  assert.ok(conditional);
  assert.deepEqual(conditional.condition, {
    kind: "binary",
    operator: "===",
    left: { kind: "variable", name: "status" },
    right: { kind: "string", value: "yes" },
  });
  assert.equal(conditional.thenBody[0]?.origin.nodeId, "log-true");
  assert.equal(conditional.elseBody[0]?.origin.nodeId, "log-false");
});

test("an invalid branch operator is rejected instead of being defaulted silently", () => {
  const graph = loadBranchingGraph();
  const condition = graph.nodes.find((node) => node.id === "if-1");
  assert.ok(condition);
  condition.properties["operator"] = "greaterThan";
  const result = lowerGraph(graph);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((entry) => entry.code === "GRAPH_PROPERTY_TYPE_MISMATCH"));
});
