import type { Edge, Node } from "@xyflow/react";
import { CORE_CONSOLE_LOG, CORE_IF, CORE_REPEAT, CORE_SET_VARIABLE } from "@visulith/engine";
import type { Diagnostic, GraphConnection, GraphDocument, GraphNode, PortKind, Position } from "@visulith/engine";

export interface FlowNodeData extends Record<string, unknown> {
  definitionId: string;
  definitionVersion: string;
  properties: Record<string, unknown>;
  errorCount: number;
  warningCount: number;
}

export type FlowNode = Node<FlowNodeData, "visulith">;

export interface FlowEdgeData extends Record<string, unknown> {
  kind: PortKind;
}

export type FlowEdge = Edge<FlowEdgeData>;

/** Minimal connection shape shared by React Flow connections and our pure helpers. */
export interface ConnectionLike {
  source: string | null;
  target: string | null;
  sourceHandle: string | null;
  targetHandle: string | null;
}

export function indexDiagnostics(diagnostics: readonly Diagnostic[]): Map<string, Diagnostic[]> {
  const index = new Map<string, Diagnostic[]>();
  for (const entry of diagnostics) {
    const nodeId = entry.origin?.nodeId;
    if (nodeId === undefined) continue;
    const bucket = index.get(nodeId);
    if (bucket === undefined) index.set(nodeId, [entry]);
    else bucket.push(entry);
  }
  return index;
}

export function graphToFlowNodes(
  graph: GraphDocument,
  diagnosticsByNode: ReadonlyMap<string, readonly Diagnostic[]> = new Map(),
): FlowNode[] {
  return graph.nodes.map((node) => {
    const entries = diagnosticsByNode.get(node.id) ?? [];
    return {
      id: node.id,
      type: "visulith" as const,
      position: node.position ?? { x: 0, y: 0 },
      data: {
        definitionId: node.definitionId,
        definitionVersion: node.definitionVersion,
        properties: { ...node.properties },
        errorCount: entries.filter((entry) => entry.severity === "error").length,
        warningCount: entries.filter((entry) => entry.severity === "warning").length,
      },
    };
  });
}

export function graphToFlowEdges(graph: GraphDocument): FlowEdge[] {
  return graph.connections.map((connection) => ({
    id: connection.id,
    source: connection.source.nodeId,
    target: connection.target.nodeId,
    sourceHandle: connection.source.portId,
    targetHandle: connection.target.portId,
    type: "smoothstep",
    label: connection.kind === "execution" ? "exec" : undefined,
    data: { kind: connection.kind },
    style: {
      stroke: connection.kind === "execution" ? "#e5b567" : "#70a9e1",
      strokeWidth: 2,
    },
  }));
}

export function createEmptyGraph(id: string, name: string): GraphDocument {
  return {
    schemaVersion: "0.1",
    id,
    kind: "structured-flow",
    name,
    nodes: [
      {
        id: "start-1",
        definitionId: "visulith.core.start",
        definitionVersion: "0.1",
        position: { x: 120, y: 120 },
        properties: {},
      },
    ],
    connections: [],
  };
}

function shortId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

const DEFAULT_PROPERTIES: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  [CORE_CONSOLE_LOG.definitionId]: { message: "New message" },
  [CORE_SET_VARIABLE.definitionId]: { name: "value", value: "" },
  [CORE_IF.definitionId]: { variable: "value", operator: "equals", value: "" },
  [CORE_REPEAT.definitionId]: { count: 3 },
};

export function addNodeToGraph(graph: GraphDocument, definitionId: string, position: Position, id?: string): GraphDocument {
  const node: GraphNode = {
    id: id ?? shortId(definitionId.split(".").at(-1) ?? "node"),
    definitionId,
    definitionVersion: "0.1",
    position,
    properties: { ...(DEFAULT_PROPERTIES[definitionId] ?? {}) },
  };
  return { ...graph, nodes: [...graph.nodes, node] };
}

export function addConnection(graph: GraphDocument, connection: ConnectionLike, kind: PortKind): GraphDocument {
  const { source, target, sourceHandle, targetHandle } = connection;
  if (source === null || target === null || sourceHandle === null || targetHandle === null) return graph;
  const next: GraphConnection = {
    id: shortId("edge"),
    source: { nodeId: source, portId: sourceHandle },
    target: { nodeId: target, portId: targetHandle },
    kind,
  };
  return { ...graph, connections: [...graph.connections, next] };
}

export function removeEntities(graph: GraphDocument, nodeIds: readonly string[], edgeIds: readonly string[]): GraphDocument {
  const removedNodes = new Set(nodeIds);
  const removedEdges = new Set(edgeIds);
  return {
    ...graph,
    nodes: graph.nodes.filter((node) => !removedNodes.has(node.id)),
    connections: graph.connections.filter(
      (edge) =>
        !removedEdges.has(edge.id) && !removedNodes.has(edge.source.nodeId) && !removedNodes.has(edge.target.nodeId),
    ),
  };
}

export function updateNodeProperties(
  graph: GraphDocument,
  nodeId: string,
  properties: Record<string, unknown>,
): GraphDocument {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => (node.id === nodeId ? { ...node, properties } : node)),
  };
}

export function updateNodePosition(graph: GraphDocument, nodeId: string, position: Position): GraphDocument {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => (node.id === nodeId ? { ...node, position } : node)),
  };
}
