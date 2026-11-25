import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  analyzeDataflow,
  parseGraphDocument,
  validateGraph,
  type Diagnostic,
  type GraphDocument,
} from "../index.js";

function loadDataflowGraph(): GraphDocument {
  const json = JSON.parse(readFileSync(new URL("../../../../fixtures/graph-dataflow.json", import.meta.url), "utf8")) as unknown;
  const loaded = parseGraphDocument(json);
  assert.ok(loaded.value);
  return JSON.parse(JSON.stringify(loaded.value)) as GraphDocument;
}

function codes(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((entry) => entry.code);
}

test("the dataflow fixture validates and exposes its sink", () => {
  const graph = loadDataflowGraph();
  assert.deepEqual(validateGraph(graph), []);
  const diagnostics: Diagnostic[] = [];
  const analysis = analyzeDataflow(graph, diagnostics);
  assert.ok(analysis);
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(
    analysis.sinks.map((node) => node.id),
    ["print"],
  );
  assert.equal(analysis.incomingByPort.get("sum:left")?.source.nodeId, "left");
});

test("dataflow rejects a second connection to one input port", () => {
  const graph = loadDataflowGraph();
  graph.connections.push({
    id: "edge-extra-fan-in",
    source: { nodeId: "right", portId: "value" },
    target: { nodeId: "sum", portId: "left" },
    kind: "data",
  });
  const diagnostics = validateGraph(graph);
  assert.ok(codes(diagnostics).includes("GRAPH_DATAFLOW_FAN_IN"));
});

test("dataflow rejects a missing required input", () => {
  const graph = loadDataflowGraph();
  graph.connections = graph.connections.filter((connection) => connection.id !== "edge-right-sum");
  const diagnostics = validateGraph(graph);
  assert.ok(codes(diagnostics).includes("GRAPH_DATAFLOW_INPUT_MISSING"));
});

test("dataflow rejects cycles reachable from a sink", () => {
  const graph = loadDataflowGraph();
  graph.nodes.push({
    id: "other",
    definitionId: "visulith.core.data.add",
    definitionVersion: "0.1",
    properties: {},
  });
  graph.connections.push({
    id: "edge-sum-other",
    source: { nodeId: "sum", portId: "result" },
    target: { nodeId: "other", portId: "left" },
    kind: "data",
  });
  graph.connections.push({
    id: "edge-other-sum",
    source: { nodeId: "other", portId: "result" },
    target: { nodeId: "sum", portId: "right" },
    kind: "data",
  });
  graph.connections = graph.connections.filter((connection) => connection.id !== "edge-right-sum");
  const diagnostics = validateGraph(graph);
  assert.ok(codes(diagnostics).includes("GRAPH_DATAFLOW_CYCLE"));
});

test("dataflow reports nodes that do not contribute to a sink", () => {
  const graph = loadDataflowGraph();
  graph.nodes.push({
    id: "orphan",
    definitionId: "visulith.core.data.int-literal",
    definitionVersion: "0.1",
    properties: { value: 9 },
  });
  const diagnostics = validateGraph(graph);
  const entry = diagnostics.find((item) => item.code === "GRAPH_DATAFLOW_UNREACHABLE_NODE");
  assert.equal(entry?.origin?.nodeId, "orphan");
});

test("dataflow rejects execution edges", () => {
  const graph = loadDataflowGraph();
  const edge = graph.connections.find((connection) => connection.id === "edge-sum-print");
  assert.ok(edge);
  edge.kind = "execution";
  const diagnostics = validateGraph(graph);
  assert.ok(codes(diagnostics).includes("GRAPH_DATAFLOW_CONNECTION_KIND"));
});

test("structured-flow definitions are not silently accepted in dataflow graphs", () => {
  const graph = loadDataflowGraph();
  graph.nodes.push({
    id: "stray",
    definitionId: "visulith.core.console-log",
    definitionVersion: "0.1",
    properties: { message: "nope" },
  });
  const diagnostics = validateGraph(graph);
  const entry = diagnostics.find(
    (item) => item.code === "GRAPH_NODE_DEFINITION_UNKNOWN" && item.origin?.nodeId === "stray",
  );
  assert.ok(entry);
});
