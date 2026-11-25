import { error, type Diagnostic } from "../diagnostics.js";
import { buildExecutionChain } from "./flow.js";
import {
  CORE_NODE_DEFINITIONS,
  CORE_START,
  isPropertyValueOfType,
  type NodeDefinitionRegistry,
} from "./nodes.js";
import { DATAFLOW_NODE_DEFINITIONS } from "./dataflow-nodes.js";
import { analyzeDataflow } from "./dataflow.js";
import {
  DATAFLOW_KIND,
  GRAPH_SCHEMA_VERSION,
  STRUCTURED_FLOW_KIND,
  typesEqual,
  type GraphDocument,
  type GraphNode,
  type PortKind,
} from "./types.js";

const CONNECTION_KINDS: readonly PortKind[] = ["data", "execution", "event", "reference"];

function defaultRegistry(kind: string): NodeDefinitionRegistry {
  return kind === DATAFLOW_KIND ? DATAFLOW_NODE_DEFINITIONS : CORE_NODE_DEFINITIONS;
}

/** Structural, connection and type checks shared by every graph kind. */
function validateCommonGraph(graph: GraphDocument, registry: NodeDefinitionRegistry): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const nodeById = new Map<string, GraphNode>();
  for (const node of graph.nodes) {
    if (nodeById.has(node.id)) {
      diagnostics.push(
        error("GRAPH_DUPLICATE_NODE_ID", `Duplicate node id "${node.id}".`, {
          graphId: graph.id,
          nodeId: node.id,
        }),
      );
      continue;
    }
    nodeById.set(node.id, node);

    const definition = registry.get(node.definitionId);
    if (definition === undefined) {
      diagnostics.push(
        error(
          "GRAPH_NODE_DEFINITION_UNKNOWN",
          `Unknown node definition "${node.definitionId}".`,
          { graphId: graph.id, nodeId: node.id },
          "Register a node definition or remove the node.",
        ),
      );
      continue;
    }
    if (definition.version !== node.definitionVersion) {
      diagnostics.push(
        error(
          "GRAPH_NODE_VERSION_UNSUPPORTED",
          `Node uses definition version ${node.definitionVersion}, but ${definition.version} is available.`,
          { graphId: graph.id, nodeId: node.id },
          "Migrate the node explicitly; versions are never reinterpreted silently.",
        ),
      );
    }

    for (const property of definition.properties) {
      if (!(property.key in node.properties)) {
        if (property.required) {
          diagnostics.push(
            error(
              "GRAPH_PROPERTY_MISSING",
              `Required property "${property.key}" is missing.`,
              { graphId: graph.id, nodeId: node.id },
            ),
          );
        }
        continue;
      }
      if (!isPropertyValueOfType(node.properties[property.key], property.type, property.enumValues)) {
        diagnostics.push(
          error(
            "GRAPH_PROPERTY_TYPE_MISMATCH",
            `Property "${property.key}" must be of type ${property.type.name}.`,
            { graphId: graph.id, nodeId: node.id },
          ),
        );
      }
    }
  }

  const connectionIds = new Set<string>();
  for (const connection of graph.connections) {
    const origin = { graphId: graph.id, connectionId: connection.id };
    if (connectionIds.has(connection.id)) {
      diagnostics.push(error("GRAPH_DUPLICATE_CONNECTION_ID", `Duplicate connection id "${connection.id}".`, origin));
      continue;
    }
    connectionIds.add(connection.id);
    if (!CONNECTION_KINDS.includes(connection.kind)) {
      diagnostics.push(error("GRAPH_CONNECTION_KIND_UNKNOWN", `Unknown connection kind "${connection.kind}".`, origin));
      continue;
    }

    const sourceNode = nodeById.get(connection.source.nodeId);
    const targetNode = nodeById.get(connection.target.nodeId);
    if (sourceNode === undefined || targetNode === undefined) {
      diagnostics.push(
        error(
          "GRAPH_CONNECTION_ENDPOINT_MISSING",
          "Connection references a node that does not exist.",
          { ...origin, nodeId: sourceNode === undefined ? connection.source.nodeId : connection.target.nodeId },
        ),
      );
      continue;
    }

    const sourceDefinition = registry.get(sourceNode.definitionId);
    const targetDefinition = registry.get(targetNode.definitionId);
    const sourcePort = sourceDefinition?.outputs.find((port) => port.id === connection.source.portId);
    const targetPort = targetDefinition?.inputs.find((port) => port.id === connection.target.portId);
    if (sourcePort === undefined) {
      diagnostics.push(
        error(
          "GRAPH_PORT_SOURCE_UNKNOWN",
          `Unknown output port "${connection.source.portId}" on node "${sourceNode.id}".`,
          { ...origin, nodeId: sourceNode.id, portId: connection.source.portId },
        ),
      );
      continue;
    }
    if (targetPort === undefined) {
      diagnostics.push(
        error(
          "GRAPH_PORT_TARGET_UNKNOWN",
          `Unknown input port "${connection.target.portId}" on node "${targetNode.id}".`,
          { ...origin, nodeId: targetNode.id, portId: connection.target.portId },
        ),
      );
      continue;
    }
    if (sourcePort.kind !== targetPort.kind) {
      diagnostics.push(
        error(
          "GRAPH_PORT_KIND_MISMATCH",
          `Port kinds differ: ${sourcePort.kind} -> ${targetPort.kind}.`,
          { ...origin, nodeId: targetNode.id, portId: targetPort.id },
        ),
      );
      continue;
    }
    if (sourcePort.kind !== connection.kind) {
      diagnostics.push(
        error(
          "GRAPH_CONNECTION_KIND_MISMATCH",
          `Connection kind "${connection.kind}" does not match port kind "${sourcePort.kind}".`,
          origin,
        ),
      );
      continue;
    }
    if (sourcePort.kind === "data" && !typesEqual(sourcePort.type, targetPort.type)) {
      diagnostics.push(
        error(
          "GRAPH_TYPE_MISMATCH",
          `Data types are incompatible: ${sourcePort.type.name} -> ${targetPort.type.name}.`,
          { ...origin, nodeId: targetNode.id, portId: targetPort.id },
          "Insert an explicit conversion node; implicit conversions are not inserted.",
        ),
      );
    }
  }

  return diagnostics;
}

/** Structural, connection, type and kind-specific semantic validation. */
export function validateGraph(
  graph: GraphDocument,
  registry: NodeDefinitionRegistry = defaultRegistry(graph.kind),
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (graph.schemaVersion !== GRAPH_SCHEMA_VERSION) {
    diagnostics.push(
      error(
        "GRAPH_SCHEMA_UNSUPPORTED",
        `Graph schemaVersion "${graph.schemaVersion}" is not supported (expected ${GRAPH_SCHEMA_VERSION}).`,
        { graphId: graph.id },
      ),
    );
    return diagnostics;
  }
  if (graph.kind !== STRUCTURED_FLOW_KIND && graph.kind !== DATAFLOW_KIND) {
    diagnostics.push(
      error(
        "GRAPH_KIND_UNSUPPORTED",
        `Graph kind "${graph.kind}" is not supported (expected ${STRUCTURED_FLOW_KIND} or ${DATAFLOW_KIND}).`,
        { graphId: graph.id },
      ),
    );
    return diagnostics;
  }

  diagnostics.push(...validateCommonGraph(graph, registry));

  if (graph.kind === DATAFLOW_KIND) {
    analyzeDataflow(graph, diagnostics, registry);
    return diagnostics;
  }

  // Flow validation adds cycle, reachability, start-node and execution-port diagnostics.
  buildExecutionChain(graph, diagnostics, registry);

  // A Start node must not declare execution inputs, otherwise the chain has no entry point.
  const startOutputCount = CORE_START.outputs.filter((port) => port.kind === "execution").length;
  if (startOutputCount !== 1) {
    diagnostics.push(error("GRAPH_START_PORTS_INVALID", "Start definition must expose exactly one execution output."));
  }

  return diagnostics;
}
