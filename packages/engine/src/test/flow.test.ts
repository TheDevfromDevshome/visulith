import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { analyzeFlow, parseGraphDocument, type Diagnostic, type GraphConnection, type GraphDocument } from "../index.js";

function loadBranchingGraph(): GraphDocument {
  const json = JSON.parse(readFileSync(new URL("../../../../fixtures/graph-branching.json", import.meta.url), "utf8")) as unknown;
  const loaded = parseGraphDocument(json);
  assert.ok(loaded.value);
  return loaded.value;
}

test("flow analysis keeps the two branch ports separate", () => {
  const graph = loadBranchingGraph();
  const diagnostics: Diagnostic[] = [];
  const flow = analyzeFlow(graph, diagnostics);
  assert.ok(flow);
  assert.equal(diagnostics.length, 0);
  assert.equal(flow.execByPort.get("if-1:exec-true")?.target.nodeId, "log-true");
  assert.equal(flow.execByPort.get("if-1:exec-false")?.target.nodeId, "log-false");
  assert.equal(flow.order.length, 5);
});

test("one execution port cannot drive two nodes in the MVP subset", () => {
  const graph = loadBranchingGraph();
  const extra: GraphConnection = {
    id: "edge-extra",
    source: { nodeId: "if-1", portId: "exec-true" },
    target: { nodeId: "log-false", portId: "exec-in" },
    kind: "execution",
  };
  graph.connections.push(extra);
  const diagnostics: Diagnostic[] = [];
  analyzeFlow(graph, diagnostics);
  assert.ok(diagnostics.some((entry) => entry.code === "GRAPH_MULTIPLE_EXEC_OUTPUTS"));
});

test("unreachable nodes are reported with their node id", () => {
  const graph = loadBranchingGraph();
  graph.connections = graph.connections.filter((connection) => connection.id !== "edge-if-false");
  const diagnostics: Diagnostic[] = [];
  analyzeFlow(graph, diagnostics);
  const unreachable = diagnostics.find((entry) => entry.code === "GRAPH_NODE_UNREACHABLE");
  assert.equal(unreachable?.origin?.nodeId, "log-false");
});
