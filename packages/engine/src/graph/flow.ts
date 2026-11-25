import { error, type Diagnostic } from "../diagnostics.js";
import { CORE_START, type NodeDefinitionRegistry } from "./nodes.js";
import { CORE_NODE_DEFINITIONS } from "./nodes.js";
import type { GraphConnection, GraphDocument, GraphNode } from "./types.js";

/**
 * MVP semantics: structured flow is a single linear execution chain beginning at
 * exactly one Start node. Branching and event graphs need a future flow model.
 */
export function buildExecutionChain(
  graph: GraphDocument,
  diagnostics: Diagnostic[],
  registry: NodeDefinitionRegistry = CORE_NODE_DEFINITIONS,
): GraphNode[] {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, GraphConnection>();
  const incomingCount = new Map<string, number>();

  for (const connection of graph.connections) {
    if (connection.kind !== "execution") continue;
    const origin = {
      graphId: graph.id,
      nodeId: connection.source.nodeId,
      connectionId: connection.id,
    };
    if (!nodeById.has(connection.source.nodeId) || !nodeById.has(connection.target.nodeId)) continue;
    if (outgoing.has(connection.source.nodeId)) {
      diagnostics.push(
        error("GRAPH_MULTIPLE_EXEC_OUTPUTS", "An execution output may only have one connection in the MVP subset.", origin),
      );
      continue;
    }
    outgoing.set(connection.source.nodeId, connection);
    const count = (incomingCount.get(connection.target.nodeId) ?? 0) + 1;
    incomingCount.set(connection.target.nodeId, count);
    if (count > 1) {
      diagnostics.push(
        error(
          "GRAPH_MULTIPLE_EXEC_INPUTS",
          "A node may only have one incoming execution connection in the MVP subset.",
          { graphId: graph.id, nodeId: connection.target.nodeId, connectionId: connection.id },
        ),
      );
    }
  }

  const starts = graph.nodes.filter((node) => node.definitionId === CORE_START.definitionId);
  if (starts.length === 0) {
    diagnostics.push(
      error("GRAPH_START_MISSING", "A structured-flow graph requires exactly one visulith.core.start node.", {
        graphId: graph.id,
      }),
    );
    return [];
  }
  if (starts.length > 1) {
    diagnostics.push(
      error("GRAPH_START_MULTIPLE", "A structured-flow graph may contain only one Start node.", {
        graphId: graph.id,
      }),
    );
    return [];
  }

  const start = starts[0]!;
  const order: GraphNode[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  let current: GraphNode | undefined = start;

  while (current !== undefined) {
    if (visiting.has(current.id)) {
      diagnostics.push(
        error("GRAPH_EXECUTION_CYCLE", "The execution chain contains a cycle.", {
          graphId: graph.id,
          nodeId: current.id,
        }),
      );
      break;
    }
    if (visited.has(current.id)) {
      diagnostics.push(
        error("GRAPH_EXECUTION_REVISITED", "A node is reached more than once by the execution chain.", {
          graphId: graph.id,
          nodeId: current.id,
        }),
      );
      break;
    }
    visiting.add(current.id);
    order.push(current);
    visited.add(current.id);

    const nextConnection = outgoing.get(current.id);
    current = nextConnection ? nodeById.get(nextConnection.target.nodeId) : undefined;
  }

  for (const node of graph.nodes) {
    if (!visited.has(node.id)) {
      diagnostics.push(
        error("GRAPH_NODE_UNREACHABLE", "Node is not reachable from the Start node.", {
          graphId: graph.id,
          nodeId: node.id,
        }),
      );
    }
    const definition = registry.get(node.definitionId);
    const requiresExecIn = definition?.inputs.some((port) => port.kind === "execution" && port.required === true);
    if (requiresExecIn && (incomingCount.get(node.id) ?? 0) === 0) {
      diagnostics.push(
        error("GRAPH_EXEC_INPUT_MISSING", "Node requires an incoming execution connection.", {
          graphId: graph.id,
          nodeId: node.id,
        }),
      );
    }
  }

  return order;
}
