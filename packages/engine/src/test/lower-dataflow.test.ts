import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  generateTypeScript,
  lowerGraph,
  parseGraphDocument,
  TYPES,
  type GraphDocument,
  type IrCallStatement,
  type IrVariableDeclaration,
} from "../index.js";

function loadDataflowGraph(): GraphDocument {
  const json = JSON.parse(readFileSync(new URL("../../../../fixtures/graph-dataflow.json", import.meta.url), "utf8")) as unknown;
  const loaded = parseGraphDocument(json);
  assert.ok(loaded.value);
  return JSON.parse(JSON.stringify(loaded.value)) as GraphDocument;
}

test("lowering emits a typed computation and one log call", () => {
  const result = lowerGraph(loadDataflowGraph());
  assert.ok(result.value);
  const body = result.value.functions[0]?.body ?? [];
  assert.deepEqual(body.map((statement) => statement.kind), ["variable", "call", "return"]);

  const variable = body[0] as IrVariableDeclaration;
  assert.deepEqual(variable.type, TYPES.i32);
  assert.deepEqual(variable.value, {
    kind: "binary",
    operator: "+",
    left: { kind: "integer", value: 2 },
    right: { kind: "integer", value: 3 },
  });
  assert.deepEqual(variable.origin, { graphId: "example.dataflow", nodeId: "sum" });

  const call = body[1] as IrCallStatement;
  assert.equal(call.target, "core.console.log");
  assert.deepEqual(call.origin, { graphId: "example.dataflow", nodeId: "print" });
});

test("source maps order the computation before the sink", () => {
  const lowered = lowerGraph(loadDataflowGraph());
  assert.ok(lowered.value);
  const generated = generateTypeScript(lowered.value);
  assert.ok(generated.source);
  // Column 1 entries describe the function origin; deeper columns describe statements.
  const line = (nodeId: string): number | undefined =>
    generated.sourceMap.find((entry) => entry.origin.nodeId === nodeId && entry.generatedColumn > 1)?.generatedLine;
  const computation = line("sum");
  const sink = line("print");
  assert.ok(computation !== undefined && sink !== undefined);
  assert.ok(computation < sink);
});

test("non-integer literals produce diagnostics instead of IR", () => {
  const graph = loadDataflowGraph();
  const left = graph.nodes.find((node) => node.id === "left");
  assert.ok(left);
  left.properties["value"] = 1.5;
  const result = lowerGraph(graph);
  assert.equal(result.ok, false);
  assert.equal(result.value, undefined);
  assert.ok(result.diagnostics.some((entry) => entry.code === "IR_DATAFLOW_LITERAL_INVALID"));
});

test("multiple sinks share one computation and emit calls in graph order", () => {
  const graph = loadDataflowGraph();
  graph.nodes.push({
    id: "print2",
    definitionId: "visulith.core.data.log",
    definitionVersion: "0.1",
    properties: {},
  });
  graph.connections.push({
    id: "edge-sum-print2",
    source: { nodeId: "sum", portId: "result" },
    target: { nodeId: "print2", portId: "value" },
    kind: "data",
  });
  const result = lowerGraph(graph);
  assert.ok(result.value);
  const body = result.value.functions[0]?.body ?? [];
  assert.deepEqual(body.map((statement) => statement.kind), ["variable", "call", "call", "return"]);
  assert.deepEqual(
    body.filter((statement) => statement.kind === "call").map((statement) => statement.origin.nodeId),
    ["print", "print2"],
  );
});
