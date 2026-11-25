import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  generateTypeScript,
  lowerGraph,
  parseGraphDocument,
  type GraphDocument,
  type IrCallStatement,
  type IrConditional,
} from "../index.js";

function loadJoinGraph(): GraphDocument {
  const json = JSON.parse(readFileSync(new URL("../../../../fixtures/graph-join.json", import.meta.url), "utf8")) as unknown;
  const loaded = parseGraphDocument(json);
  assert.ok(loaded.value);
  return JSON.parse(JSON.stringify(loaded.value)) as GraphDocument;
}

test("lowering emits the join once after the conditional", () => {
  const result = lowerGraph(loadJoinGraph());
  assert.ok(result.value);
  const body = result.value.functions[0]?.body ?? [];
  assert.deepEqual(body.map((statement) => statement.kind), ["variable", "conditional", "call", "return"]);

  const conditional = body[1] as IrConditional;
  assert.equal(conditional.thenBody.length, 1);
  assert.equal(conditional.elseBody.length, 1);
  assert.deepEqual(
    conditional.thenBody.map((statement) => statement.origin.nodeId),
    ["log-true"],
  );
  assert.deepEqual(
    conditional.elseBody.map((statement) => statement.origin.nodeId),
    ["log-false"],
  );
  assert.equal((body[2] as IrCallStatement).origin.nodeId, "join-1");
});

test("source mappings place the join after both branches", () => {
  const lowered = lowerGraph(loadJoinGraph());
  assert.ok(lowered.value);
  const generated = generateTypeScript(lowered.value);
  assert.ok(generated.source);
  const ifLine = generated.sourceMap.find((entry) => entry.origin.nodeId === "if-1")?.generatedLine;
  const joinLine = generated.sourceMap.find((entry) => entry.origin.nodeId === "join-1")?.generatedLine;
  assert.ok(ifLine !== undefined && joinLine !== undefined);
  assert.ok(joinLine > ifLine);
  assert.match(generated.source, /console\.log\("joined"\);/);
});

test("unsupported reconvergence produces a diagnostic and no IR", () => {
  const graph: GraphDocument = {
    schemaVersion: "0.1",
    id: "example.bad-join",
    kind: "structured-flow",
    name: "Unsupported fan-in",
    nodes: [
      { id: "start-1", definitionId: "visulith.core.start", definitionVersion: "0.1", properties: {} },
      {
        id: "if-1",
        definitionId: "visulith.core.if",
        definitionVersion: "0.1",
        properties: { variable: "status", operator: "equals", value: "yes" },
      },
      { id: "log-a", definitionId: "visulith.core.console-log", definitionVersion: "0.1", properties: { message: "a" } },
      { id: "log-b", definitionId: "visulith.core.console-log", definitionVersion: "0.1", properties: { message: "b" } },
      { id: "sink", definitionId: "visulith.core.console-log", definitionVersion: "0.1", properties: { message: "sink" } },
    ],
    connections: [
      { id: "e1", source: { nodeId: "start-1", portId: "exec-out" }, target: { nodeId: "if-1", portId: "exec-in" }, kind: "execution" },
      { id: "e2", source: { nodeId: "if-1", portId: "exec-true" }, target: { nodeId: "log-a", portId: "exec-in" }, kind: "execution" },
      { id: "e3", source: { nodeId: "if-1", portId: "exec-false" }, target: { nodeId: "log-b", portId: "exec-in" }, kind: "execution" },
      { id: "e4", source: { nodeId: "log-b", portId: "exec-out" }, target: { nodeId: "log-a", portId: "exec-in" }, kind: "execution" },
      { id: "e5", source: { nodeId: "log-a", portId: "exec-out" }, target: { nodeId: "sink", portId: "exec-in" }, kind: "execution" },
    ],
  };
  const result = lowerGraph(graph);
  assert.equal(result.ok, false);
  assert.equal(result.value, undefined);
  assert.ok(result.diagnostics.some((entry) => entry.code === "GRAPH_RECONVERGENCE_UNSUPPORTED"));
});
