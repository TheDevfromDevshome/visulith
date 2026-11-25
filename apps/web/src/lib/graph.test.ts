import assert from "node:assert/strict";
import test from "node:test";
import type { Diagnostic } from "@visulith/engine";
import {
  addConnection,
  addNodeToGraph,
  createEmptyGraph,
  graphToFlowEdges,
  graphToFlowNodes,
  indexDiagnostics,
  removeEntities,
  updateNodePosition,
  updateNodeProperties,
} from "./graph";
import { describeGraphChange } from "./diff";

test("an empty graph contains only a start node", () => {
  const graph = createEmptyGraph("test.flow", "Test flow");
  assert.equal(graph.nodes.length, 1);
  assert.equal(graph.nodes[0]?.definitionId, "visulith.core.start");
  assert.equal(graph.connections.length, 0);
});

test("adding a console-log node seeds a string message", () => {
  const graph = addNodeToGraph(createEmptyGraph("test.flow", "Test flow"), "visulith.core.console-log", { x: 10, y: 20 }, "log-1");
  assert.deepEqual(graph.nodes[1]?.properties, { message: "New message" });
  assert.deepEqual(graph.nodes[1]?.position, { x: 10, y: 20 });
});

test("adding a set-variable node seeds its required properties", () => {
  const graph = addNodeToGraph(createEmptyGraph("test.flow", "Test flow"), "visulith.core.set-variable", { x: 10, y: 20 }, "set-1");
  assert.deepEqual(graph.nodes[1]?.properties, { name: "value", value: "" });
});

test("adding an if node seeds a valid default operator", () => {
  const graph = addNodeToGraph(createEmptyGraph("test.flow", "Test flow"), "visulith.core.if", { x: 10, y: 20 }, "if-1");
  assert.deepEqual(graph.nodes[1]?.properties, { variable: "value", operator: "equals", value: "" });
});

test("adding a repeat node seeds a positive integer count", () => {
  const graph = addNodeToGraph(createEmptyGraph("test.flow", "Test flow"), "visulith.core.repeat", { x: 10, y: 20 }, "repeat-1");
  assert.deepEqual(graph.nodes[1]?.properties, { count: 3 });
});

test("connections and node updates keep the document consistent", () => {
  let graph = addNodeToGraph(createEmptyGraph("test.flow", "Test flow"), "visulith.core.console-log", { x: 0, y: 200 }, "log-1");
  graph = addConnection(
    graph,
    { source: "start-1", target: "log-1", sourceHandle: "exec-out", targetHandle: "exec-in" },
    "execution",
  );
  assert.equal(graph.connections[0]?.kind, "execution");
  assert.equal(graphToFlowEdges(graph)[0]?.sourceHandle, "exec-out");

  graph = updateNodeProperties(graph, "log-1", { message: "Updated" });
  graph = updateNodePosition(graph, "log-1", { x: 42, y: 84 });
  assert.equal(graph.nodes[1]?.properties["message"], "Updated");
  assert.deepEqual(graph.nodes[1]?.position, { x: 42, y: 84 });

  graph = removeEntities(graph, ["log-1"], []);
  assert.equal(graph.nodes.length, 1);
  assert.equal(graph.connections.length, 0, "connections to a deleted node are removed as well");
});

test("diagnostics are indexed by node and rendered on flow nodes", () => {
  const diagnostics: Diagnostic[] = [
    { code: "GRAPH_PROPERTY_MISSING", severity: "error", message: "missing message", origin: { nodeId: "log-1" } },
    { code: "GRAPH_TYPE_MISMATCH", severity: "warning", message: "type mismatch", origin: { nodeId: "log-1" } },
  ];
  const graph = addNodeToGraph(createEmptyGraph("test.flow", "Test flow"), "visulith.core.console-log", { x: 0, y: 0 }, "log-1");
  const nodes = graphToFlowNodes(graph, indexDiagnostics(diagnostics));
  assert.equal(nodes[1]?.data.errorCount, 1);
  assert.equal(nodes[1]?.data.warningCount, 1);
});

test("the change preview describes properties and added nodes", () => {
  const before = addNodeToGraph(createEmptyGraph("test.flow", "Test flow"), "visulith.core.console-log", { x: 0, y: 0 }, "log-1");
  const after = updateNodeProperties(before, "log-1", { message: "Hello" });
  const preview = describeGraphChange(before, after);
  assert.match(preview, /log-1\.properties/);
  assert.match(preview, /Hello/);
});
