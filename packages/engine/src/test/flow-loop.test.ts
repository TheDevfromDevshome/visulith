import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { analyzeFlow, parseGraphDocument, validateGraph, type Diagnostic, type GraphDocument } from "../index.js";

function loadLoopGraph(): GraphDocument {
  const json = JSON.parse(readFileSync(new URL("../../../../fixtures/graph-loop.json", import.meta.url), "utf8")) as unknown;
  const loaded = parseGraphDocument(json);
  assert.ok(loaded.value);
  return JSON.parse(JSON.stringify(loaded.value)) as GraphDocument;
}

test("a valid repeat back edge is not reported as an execution cycle", () => {
  const graph = loadLoopGraph();
  const diagnostics: Diagnostic[] = [];
  const flow = analyzeFlow(graph, diagnostics);
  assert.ok(flow);
  assert.deepEqual(diagnostics, []);
  assert.equal(flow.loopBackEdges.get("repeat-1")?.id, "edge-body-back");
  assert.deepEqual(
    flow.order.map((node) => node.id),
    ["start-1", "repeat-1", "log-body", "log-done"],
  );
  assert.deepEqual(validateGraph(graph), []);
});

test("a repeat node without a back edge is rejected", () => {
  const graph = loadLoopGraph();
  graph.connections = graph.connections.filter((connection) => connection.id !== "edge-body-back");
  const diagnostics: Diagnostic[] = [];
  analyzeFlow(graph, diagnostics);
  assert.ok(diagnostics.some((entry) => entry.code === "GRAPH_LOOP_PORTS_INVALID"));
});

test("a back edge from after the loop is rejected", () => {
  const graph = loadLoopGraph();
  const back = graph.connections.find((connection) => connection.id === "edge-body-back");
  assert.ok(back);
  back.source.nodeId = "log-done";
  const diagnostics: Diagnostic[] = [];
  analyzeFlow(graph, diagnostics);
  const entry = diagnostics.find((item) => item.code === "GRAPH_LOOP_BACK_EDGE_INVALID");
  assert.equal(entry?.origin?.nodeId, "repeat-1");
});

test("the repeat count must be a number", () => {
  const graph = loadLoopGraph();
  const repeat = graph.nodes.find((node) => node.id === "repeat-1");
  assert.ok(repeat);
  repeat.properties["count"] = "three";
  const diagnostics = validateGraph(graph);
  const entry = diagnostics.find((item) => item.code === "GRAPH_PROPERTY_TYPE_MISMATCH");
  assert.equal(entry?.origin?.nodeId, "repeat-1");
});
