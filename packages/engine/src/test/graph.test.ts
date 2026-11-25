import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  CORE_CONSOLE_LOG,
  CORE_START,
  hasErrors,
  parseGraphDocument,
  TYPES,
  validateGraph,
  type GraphDocument,
  type NodeDefinitionRegistry,
} from "../index.js";

const exampleJson = JSON.parse(
  readFileSync(new URL("../../../../fixtures/graph-example.json", import.meta.url), "utf8"),
) as unknown;

function clone(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function parse(value: unknown): GraphDocument {
  const result = parseGraphDocument(value);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.ok(result.value);
  return result.value;
}

test("example graph parses and validates", () => {
  const graph = parse(exampleJson);
  assert.deepEqual(
    validateGraph(graph).map((entry) => entry.code),
    [],
  );
  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.connections[0]?.kind, "execution");
});

test("duplicate node ids are reported", () => {
  const raw = clone(exampleJson);
  const nodes = raw["nodes"] as unknown[];
  nodes.push({ ...(nodes[0] as object) });
  const diagnostics = validateGraph(parse(raw));
  assert.ok(diagnostics.some((entry) => entry.code === "GRAPH_DUPLICATE_NODE_ID"));
});

test("unknown node definitions and versions are reported", () => {
  const raw = clone(exampleJson);
  const nodes = raw["nodes"] as Record<string, unknown>[];
  nodes[1]!["definitionId"] = "unknown.definition";
  assert.ok(validateGraph(parse(raw)).some((entry) => entry.code === "GRAPH_NODE_DEFINITION_UNKNOWN"));

  const versionRaw = clone(exampleJson);
  const versionNodes = versionRaw["nodes"] as Record<string, unknown>[];
  versionNodes[0]!["definitionVersion"] = "9.9";
  assert.ok(validateGraph(parse(versionRaw)).some((entry) => entry.code === "GRAPH_NODE_VERSION_UNSUPPORTED"));
});

test("unknown ports and invalid endpoints are reported", () => {
  const raw = clone(exampleJson);
  const connections = raw["connections"] as Record<string, unknown>[];
  const target = connections[0]!["target"] as Record<string, unknown>;
  target["portId"] = "does-not-exist";
  assert.ok(validateGraph(parse(raw)).some((entry) => entry.code === "GRAPH_PORT_TARGET_UNKNOWN"));

  const missingNode = clone(exampleJson);
  const missingConnections = missingNode["connections"] as Record<string, unknown>[];
  (missingConnections[0]!["source"] as Record<string, unknown>)["nodeId"] = "ghost";
  assert.ok(validateGraph(parse(missingNode)).some((entry) => entry.code === "GRAPH_CONNECTION_ENDPOINT_MISSING"));
});

test("missing start and execution cycles are reported", () => {
  const noStart = clone(exampleJson);
  const noStartNodes = noStart["nodes"] as unknown[];
  noStart["nodes"] = [noStartNodes[1]];
  noStart["connections"] = [];
  assert.ok(validateGraph(parse(noStart)).some((entry) => entry.code === "GRAPH_START_MISSING"));

  const cyclic = parse(exampleJson);
  cyclic.nodes.push({
    id: "log-2",
    definitionId: CORE_CONSOLE_LOG.definitionId,
    definitionVersion: CORE_CONSOLE_LOG.version,
    properties: { message: "Second" },
  });
  cyclic.connections.push(
    {
      id: "edge-2",
      source: { nodeId: "log-1", portId: "exec-out" },
      target: { nodeId: "log-2", portId: "exec-in" },
      kind: "execution",
    },
    {
      id: "edge-3",
      source: { nodeId: "log-2", portId: "exec-out" },
      target: { nodeId: "log-1", portId: "exec-in" },
      kind: "execution",
    },
  );
  assert.ok(validateGraph(cyclic).some((entry) => entry.code === "GRAPH_EXECUTION_CYCLE"));
});

test("data type mismatches are reported with a custom registry", () => {
  const registry: NodeDefinitionRegistry = new Map([
    [CORE_START.definitionId, CORE_START],
    [
      "test.string-source",
      {
        definitionId: "test.string-source",
        version: "0.1",
        displayName: "String Source",
        category: "test",
        inputs: [{ id: "exec-in", direction: "input", kind: "execution", type: TYPES.unit, required: true }],
        outputs: [
          { id: "exec-out", direction: "output", kind: "execution", type: TYPES.unit },
          { id: "value", direction: "output", kind: "data", type: TYPES.string },
        ],
        properties: [],
        capabilities: [],
      },
    ],
    [
      "test.i32-sink",
      {
        definitionId: "test.i32-sink",
        version: "0.1",
        displayName: "Integer Sink",
        category: "test",
        inputs: [
          { id: "exec-in", direction: "input", kind: "execution", type: TYPES.unit, required: true },
          { id: "value", direction: "input", kind: "data", type: TYPES.i32, required: true },
        ],
        outputs: [{ id: "exec-out", direction: "output", kind: "execution", type: TYPES.unit }],
        properties: [],
        capabilities: [],
      },
    ],
  ]);
  const graph: GraphDocument = {
    schemaVersion: "0.1",
    id: "test.types",
    kind: "structured-flow",
    name: "Types",
    nodes: [
      { id: "start", definitionId: CORE_START.definitionId, definitionVersion: "0.1", properties: {} },
      { id: "source", definitionId: "test.string-source", definitionVersion: "0.1", properties: {} },
      { id: "sink", definitionId: "test.i32-sink", definitionVersion: "0.1", properties: {} },
    ],
    connections: [
      {
        id: "e1",
        source: { nodeId: "start", portId: "exec-out" },
        target: { nodeId: "source", portId: "exec-in" },
        kind: "execution",
      },
      {
        id: "e2",
        source: { nodeId: "source", portId: "exec-out" },
        target: { nodeId: "sink", portId: "exec-in" },
        kind: "execution",
      },
      {
        id: "e3",
        source: { nodeId: "source", portId: "value" },
        target: { nodeId: "sink", portId: "value" },
        kind: "data",
      },
    ],
  };
  const diagnostics = validateGraph(graph, registry);
  assert.ok(diagnostics.some((entry) => entry.code === "GRAPH_TYPE_MISMATCH"));
  assert.equal(hasErrors(diagnostics), true);
});

test("unsupported schema versions are rejected", () => {
  const raw = clone(exampleJson);
  raw["schemaVersion"] = "9.9";
  const result = parseGraphDocument(raw);
  assert.ok(hasErrors(result.diagnostics));
});
