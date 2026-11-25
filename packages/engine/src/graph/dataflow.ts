import { error, type Diagnostic } from "../diagnostics.js";
import type { NodeDefinitionRegistry } from "./nodes.js";
import { DATAFLOW_NODE_DEFINITIONS } from "./dataflow-nodes.js";
import type { GraphConnection, GraphDocument, GraphNode } from "./types.js";

export interface DataflowAnalysis {
  nodeById: Map<string, GraphNode>;
  /** One incoming data edge per target port; fan-in is rejected during validation. */
  incomingByPort: Map<string, GraphConnection>;
  /** Nodes that consume a value and produce no further data output. */
  sinks: GraphNode[];
}

function portKey(nodeId: string, portId: string): string {
  return `${nodeId}:${portId}`;
}

/**
 * Validate the supported dataflow subset and return the maps needed for lowering.
 * Dataflow graphs have no execution edges: sinks drive evaluation of their inputs.
 */
export function analyzeDataflow(
  graph: GraphDocument,
  diagnostics: Diagnostic[],
  registry: NodeDefinitionRegistry = DATAFLOW_NODE_DEFINITIONS,
): DataflowAnalysis | undefined {
  const nodeById = new Map<string, GraphNode>();
  for (const node of graph.nodes) {
    if (!nodeById.has(node.id)) nodeById.set(node.id, node);
  }

  const incomingByPort = new Map<string, GraphConnection>();
  for (const connection of graph.connections) {
    const origin = { graphId: graph.id, connectionId: connection.id };
    if (connection.kind !== "data") {
      diagnostics.push(
        error("GRAPH_DATAFLOW_CONNECTION_KIND", `Dataflow graphs only allow data connections, got "${connection.kind}".`, {
          ...origin,
          nodeId: connection.target.nodeId,
          portId: connection.target.portId,
        }),
      );
      continue;
    }
    const key = portKey(connection.target.nodeId, connection.target.portId);
    if (incomingByPort.has(key)) {
      diagnostics.push(
        error("GRAPH_DATAFLOW_FAN_IN", `Input port "${key}" has more than one incoming data connection.`, {
          ...origin,
          nodeId: connection.target.nodeId,
          portId: connection.target.portId,
        }),
      );
      continue;
    }
    incomingByPort.set(key, connection);
  }

  let sinks: GraphNode[] = [];
  for (const node of graph.nodes) {
    const definition = registry.get(node.definitionId);
    if (definition === undefined) continue;
    if (definition.outputs.length === 0) sinks.push(node);
    for (const input of definition.inputs) {
      if (input.required && !incomingByPort.has(portKey(node.id, input.id))) {
        diagnostics.push(
          error(
            "GRAPH_DATAFLOW_INPUT_MISSING",
            `Required input "${input.id}" on node "${node.id}" is not connected.`,
            { graphId: graph.id, nodeId: node.id, portId: input.id },
          ),
        );
      }
    }
  }

  if (sinks.length === 0) {
    diagnostics.push(
      error("GRAPH_DATAFLOW_SINK_MISSING", "A dataflow graph needs at least one sink node.", { graphId: graph.id }),
    );
  }

  // Reachability and cycle detection walk backwards from sinks through data inputs.
  const reachable = new Set<string>();
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (nodeId: string): void => {
    if (visiting.has(nodeId)) {
      diagnostics.push(
        error("GRAPH_DATAFLOW_CYCLE", `Dataflow cycle detected at node "${nodeId}".`, {
          graphId: graph.id,
          nodeId,
        }),
      );
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    reachable.add(nodeId);
    for (const [key, connection] of incomingByPort) {
      if (key.startsWith(`${nodeId}:`)) walk(connection.source.nodeId);
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const sink of sinks) walk(sink.id);

  for (const node of graph.nodes) {
    if (!reachable.has(node.id)) {
      diagnostics.push(
        error("GRAPH_DATAFLOW_UNREACHABLE_NODE", `Node "${node.id}" does not contribute to any sink.`, {
          graphId: graph.id,
          nodeId: node.id,
        }),
      );
    }
  }

  if (diagnostics.some((entry) => entry.severity === "error")) return undefined;
  return { nodeById, incomingByPort, sinks };
}
