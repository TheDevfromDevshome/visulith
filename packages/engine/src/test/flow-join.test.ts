import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { analyzeFlow, parseGraphDocument, validateGraph, type Diagnostic, type GraphDocument } from "../index.js";

function loadJoinGraph(): GraphDocument {
  const json = JSON.parse(readFileSync(new URL("../../../../fixtures/graph-join.json", import.meta.url), "utf8")) as unknown;
  const loaded = parseGraphDocument(json);
  assert.ok(loaded.value);
  return JSON.parse(JSON.stringify(loaded.value)) as GraphDocument;
}

test("reconverging if branches are accepted at a shared join", () => {
  const graph = loadJoinGraph();
  const diagnostics: Diagnostic[] = [];
  const flow = analyzeFlow(graph, diagnostics);
  assert.ok(flow);
  assert.deepEqual(diagnostics, []);
  assert.equal(flow.joinByIf.get("if-1"), "join-1");
  assert.equal(flow.ifByJoin.get("join-1"), "if-1");
  assert.deepEqual(validateGraph(graph), []);
});

test("a node fed from both sides of one branch is rejected as reconvergence", () => {
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
  const diagnostics: Diagnostic[] = [];
  analyzeFlow(graph, diagnostics);
  const entry = diagnostics.find((item) => item.code === "GRAPH_RECONVERGENCE_UNSUPPORTED");
  assert.equal(entry?.origin?.nodeId, "log-a");
});

test("a join with an extra execution input is rejected", () => {
  const graph = loadJoinGraph();
  graph.connections.push({
    id: "edge-join-self",
    source: { nodeId: "join-1", portId: "exec-out" },
    target: { nodeId: "join-1", portId: "exec-in" },
    kind: "execution",
  });
  const diagnostics: Diagnostic[] = [];
  analyzeFlow(graph, diagnostics);
  assert.ok(diagnostics.some((item) => item.code === "GRAPH_RECONVERGENCE_UNSUPPORTED"));
});
