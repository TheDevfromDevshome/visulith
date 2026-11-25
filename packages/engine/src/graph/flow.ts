import { error, type Diagnostic } from "../diagnostics.js";
import { CORE_IF, CORE_NODE_DEFINITIONS, CORE_START, type NodeDefinitionRegistry } from "./nodes.js";
import type { GraphConnection, GraphDocument, GraphNode } from "./types.js";

export interface FlowAnalysis {
  start: GraphNode;
  nodeById: Map<string, GraphNode>;
  /** Execution connections keyed by `${nodeId}:${portId}`. */
  execByPort: Map<string, GraphConnection>;
  /** Depth-first preorder of every reachable node. */
  order: GraphNode[];
  /** If node id to the single node where its two branches reconverge. */
  joinByIf: Map<string, string>;
  /** Join node id to the If node whose branches reconverge there. */
  ifByJoin: Map<string, string>;
}

export function executionKey(nodeId: string, portId: string): string {
  return `${nodeId}:${portId}`;
}

function distancesFrom(
  startId: string | undefined,
  connectionsBySourceNode: ReadonlyMap<string, GraphConnection[]>,
): Map<string, number> {
  const distances = new Map<string, number>();
  if (startId === undefined) return distances;
  distances.set(startId, 0);
  const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const connection of connectionsBySourceNode.get(current.id) ?? []) {
      if (distances.has(connection.target.nodeId)) continue;
      const depth = current.depth + 1;
      distances.set(connection.target.nodeId, depth);
      queue.push({ id: connection.target.nodeId, depth });
    }
  }
  return distances;
}

/**
 * MVP semantics: structured flow is a rooted graph beginning at exactly one
 * Start node. Linear nodes have one execution output; If nodes have two
 * branches that may reconverge once at a shared join. Other fan-in patterns,
 * dataflow and event graphs are future work.
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
    incomingCount.set(connection.target.nodeId, (incomingCount.get(connection.target.nodeId) ?? 0) + 1);
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

  const joinByIf = new Map<string, string>();
  const ifByJoin = new Map<string, string>();
  const rejectedJoins = new Set<string>();
  const incomingByTarget = new Map<string, GraphConnection[]>();
  for (const connection of graph.connections) {
    if (connection.kind !== "execution") continue;
    const incoming = incomingByTarget.get(connection.target.nodeId) ?? [];
    incoming.push(connection);
    incomingByTarget.set(connection.target.nodeId, incoming);
  }

  for (const node of graph.nodes) {
    if (node.definitionId !== CORE_IF.definitionId) continue;
    const trueDistances = distancesFrom(
      execByPort.get(executionKey(node.id, "exec-true"))?.target.nodeId,
      connectionsBySourceNode,
    );
    const falseDistances = distancesFrom(
      execByPort.get(executionKey(node.id, "exec-false"))?.target.nodeId,
      connectionsBySourceNode,
    );
    if (trueDistances.size === 0 || falseDistances.size === 0) continue;

    const shared = [...trueDistances.keys()]
      .filter((id) => falseDistances.has(id) && id !== node.id && id !== start.id)
      .sort((a, b) => {
        const aDistance = trueDistances.get(a)! + falseDistances.get(a)!;
        const bDistance = trueDistances.get(b)! + falseDistances.get(b)!;
        return aDistance - bDistance || a.localeCompare(b);
      });
    if (shared.length === 0) continue;

    const join = shared[0]!;
    const incoming = incomingByTarget.get(join) ?? [];
    const trueOnly = new Set([...trueDistances.keys()].filter((id) => !falseDistances.has(id)));
    const falseOnly = new Set([...falseDistances.keys()].filter((id) => !trueDistances.has(id)));
    const supported =
      incoming.length === 2 &&
      incoming.some((connection) => trueOnly.has(connection.source.nodeId)) &&
      incoming.some((connection) => falseOnly.has(connection.source.nodeId)) &&
      incoming.every(
        (connection) => trueOnly.has(connection.source.nodeId) || falseOnly.has(connection.source.nodeId),
      ) &&
      !ifByJoin.has(join);

    if (!supported) {
      rejectedJoins.add(join);
      diagnostics.push(
        error(
          "GRAPH_RECONVERGENCE_UNSUPPORTED",
          "Reconverging branches must share exactly one join reached from one If node and no other execution input.",
          { graphId: graph.id, nodeId: join, connectionId: incoming[0]?.id },
          "Give each If branch its own join node or keep the branches separate.",
        ),
      );
      continue;
    }
    joinByIf.set(node.id, join);
    ifByJoin.set(join, node.id);
  }

  for (const [nodeId, count] of incomingCount) {
    if (count <= 1 || ifByJoin.has(nodeId) || rejectedJoins.has(nodeId)) continue;
    diagnostics.push(
      error(
        "GRAPH_MULTIPLE_EXEC_INPUTS",
        "A node may only have one incoming execution connection in the MVP subset.",
        { graphId: graph.id, nodeId, connectionId: incomingByTarget.get(nodeId)?.[0]?.id },
      ),
    );
  }

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

  return { start, nodeById, execByPort, order, joinByIf, ifByJoin };
}

/** Compatibility helper for callers that only need the ordered node list. */
export function buildExecutionChain(
  graph: GraphDocument,
  diagnostics: Diagnostic[],
  registry: NodeDefinitionRegistry = CORE_NODE_DEFINITIONS,
): GraphNode[] {
  return analyzeFlow(graph, diagnostics, registry)?.order ?? [];
}
