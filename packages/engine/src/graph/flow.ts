import { error, type Diagnostic } from "../diagnostics.js";
import { CORE_NODE_DEFINITIONS, CORE_START, type NodeDefinitionRegistry } from "./nodes.js";
import type { GraphConnection, GraphDocument, GraphNode } from "./types.js";

export interface FlowAnalysis {
  start: GraphNode;
  nodeById: Map<string, GraphNode>;
  /** Execution connections keyed by `${nodeId}:${portId}`. */
  execByPort: Map<string, GraphConnection>;
  /** Depth-first preorder of every reachable node. */
  order: GraphNode[];
}

export function executionKey(nodeId: string, portId: string): string {
  return `${nodeId}:${portId}`;
}

/**
 * MVP semantics: structured flow is a rooted graph beginning at exactly one
 * Start node. Linear nodes have one execution output; If nodes have two
 * branches that may not reconverge. Dataflow and event graphs are future work.
 */
export function analyzeFlow(
  graph: GraphDocument,
  diagnostics: Diagnostic[],
  registry: NodeDefinitionRegistry = CORE_NODE_DEFINITIONS,
): FlowAnalysis | undefined {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const execByPort = new Map<string, GraphConnection>();
  const connectionsBySourceNode = new Map<string, GraphConnection[]>();
  const incomingCount = new Map<string, number>();

  for (const connection of graph.connections) {
    if (connection.kind !== "execution") continue;
    if (!nodeById.has(connection.source.nodeId) || !nodeById.has(connection.target.nodeId)) continue;
    const key = executionKey(connection.source.nodeId, connection.source.portId);
    if (execByPort.has(key)) {
      diagnostics.push(
        error(
          "GRAPH_MULTIPLE_EXEC_OUTPUTS",
          "An execution output port may only have one connection in the MVP subset.",
          { graphId: graph.id, nodeId: connection.source.nodeId, portId: connection.source.portId, connectionId: connection.id },
        ),
      );
      continue;
    }
    execByPort.set(key, connection);
    const outgoing = connectionsBySourceNode.get(connection.source.nodeId) ?? [];
    outgoing.push(connection);
    connectionsBySourceNode.set(connection.source.nodeId, outgoing);
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
    return undefined;
  }
  if (starts.length > 1) {
    diagnostics.push(
      error("GRAPH_START_MULTIPLE", "A structured-flow graph may contain only one Start node.", { graphId: graph.id }),
    );
    return undefined;
  }
  const start = starts[0]!;

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const order: GraphNode[] = [];
  const visit = (node: GraphNode): void => {
    if (visiting.has(node.id)) {
      diagnostics.push(
        error("GRAPH_EXECUTION_CYCLE", "The execution graph contains a cycle.", {
          graphId: graph.id,
          nodeId: node.id,
        }),
      );
      return;
    }
    if (visited.has(node.id)) return;
    visiting.add(node.id);
    order.push(node);
    visited.add(node.id);
    for (const connection of connectionsBySourceNode.get(node.id) ?? []) {
      const target = nodeById.get(connection.target.nodeId);
      if (target !== undefined) visit(target);
    }
    visiting.delete(node.id);
  };
  visit(start);

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

  return { start, nodeById, execByPort, order };
}

/** Compatibility helper for callers that only need the ordered node list. */
export function buildExecutionChain(
  graph: GraphDocument,
  diagnostics: Diagnostic[],
  registry: NodeDefinitionRegistry = CORE_NODE_DEFINITIONS,
): GraphNode[] {
  return analyzeFlow(graph, diagnostics, registry)?.order ?? [];
}
