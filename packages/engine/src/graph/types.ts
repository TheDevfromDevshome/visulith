import { error, fail, isRecord, ok, type ValidationResult } from "../diagnostics.js";

/** Version of the graph document schema implemented by this proof of concept. */
export const GRAPH_SCHEMA_VERSION = "0.1";
export const STRUCTURED_FLOW_KIND = "structured-flow";

export type { PrimitiveTypeName, TypeRef } from "../types.js";
export { TYPES, primitive, typesEqual } from "../types.js";

import { typesEqual } from "../types.js";

export type PortKind = "data" | "execution" | "event" | "reference";
export type PortDirection = "input" | "output";

export interface Position {
  x: number;
  y: number;
}

export interface GraphNode {
  id: string;
  definitionId: string;
  definitionVersion: string;
  /** Presentation state is optional: a graph must remain buildable without it. */
  position?: Position;
  properties: Record<string, unknown>;
}

export interface Endpoint {
  nodeId: string;
  portId: string;
}

export interface GraphConnection {
  id: string;
  source: Endpoint;
  target: Endpoint;
  kind: PortKind;
}

export interface GraphDocument {
  schemaVersion: string;
  id: string;
  kind: string;
  name: string;
  nodes: GraphNode[];
  connections: GraphConnection[];
}

function readString(value: unknown, field: string, diagnostics: ReturnType<typeof error>[]): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    diagnostics.push(error("GRAPH_INVALID_FIELD", `Expected a non-empty string for "${field}".`));
    return undefined;
  }
  return value;
}

function parseEndpoint(value: unknown, field: string, diagnostics: ReturnType<typeof error>[]): Endpoint | undefined {
  if (!isRecord(value)) {
    diagnostics.push(error("GRAPH_INVALID_FIELD", `Expected an object for "${field}".`));
    return undefined;
  }
  const nodeId = readString(value["nodeId"], `${field}.nodeId`, diagnostics);
  const portId = readString(value["portId"], `${field}.portId`, diagnostics);
  return nodeId !== undefined && portId !== undefined ? { nodeId, portId } : undefined;
}

/** Parse untrusted JSON into a graph document without assuming any field exists. */
export function parseGraphDocument(input: unknown): ValidationResult<GraphDocument> {
  const diagnostics: ReturnType<typeof error>[] = [];
  if (!isRecord(input)) {
    return fail([error("GRAPH_INVALID_DOCUMENT", "Graph document must be a JSON object.")]);
  }

  const schemaVersion = readString(input["schemaVersion"], "schemaVersion", diagnostics);
  if (schemaVersion !== undefined && schemaVersion !== GRAPH_SCHEMA_VERSION) {
    diagnostics.push(
      error(
        "GRAPH_SCHEMA_UNSUPPORTED",
        `Graph schemaVersion "${schemaVersion}" is not supported (expected ${GRAPH_SCHEMA_VERSION}).`,
      ),
    );
  }
  const id = readString(input["id"], "id", diagnostics);
  const kind = readString(input["kind"], "kind", diagnostics);
  const name = readString(input["name"], "name", diagnostics);

  const nodes: GraphNode[] = [];
  if (!Array.isArray(input["nodes"])) {
    diagnostics.push(error("GRAPH_INVALID_FIELD", 'Expected an array for "nodes".'));
  } else {
    input["nodes"].forEach((raw, index) => {
      if (!isRecord(raw)) {
        diagnostics.push(error("GRAPH_INVALID_NODE", `Node at index ${index} must be an object.`));
        return;
      }
      const nodeId = readString(raw["id"], `nodes[${index}].id`, diagnostics);
      const definitionId = readString(raw["definitionId"], `nodes[${index}].definitionId`, diagnostics);
      const definitionVersion = readString(raw["definitionVersion"], `nodes[${index}].definitionVersion`, diagnostics);
      if (nodeId === undefined || definitionId === undefined || definitionVersion === undefined) return;

      const properties = raw["properties"] ?? {};
      if (!isRecord(properties)) {
        diagnostics.push(error("GRAPH_INVALID_FIELD", `nodes[${index}].properties must be an object.`));
        return;
      }
      const node: GraphNode = { id: nodeId, definitionId, definitionVersion, properties };
      if (raw["position"] !== undefined) {
        if (!isRecord(raw["position"])) {
          diagnostics.push(error("GRAPH_INVALID_FIELD", `nodes[${index}].position must be an object.`));
          return;
        }
        const x = raw["position"]["x"];
        const y = raw["position"]["y"];
        if (typeof x !== "number" || typeof y !== "number") {
          diagnostics.push(error("GRAPH_INVALID_FIELD", `nodes[${index}].position needs numeric x and y.`));
          return;
        }
        node.position = { x, y };
      }
      nodes.push(node);
    });
  }

  const connections: GraphConnection[] = [];
  if (!Array.isArray(input["connections"])) {
    diagnostics.push(error("GRAPH_INVALID_FIELD", 'Expected an array for "connections".'));
  } else {
    input["connections"].forEach((raw, index) => {
      if (!isRecord(raw)) {
        diagnostics.push(error("GRAPH_INVALID_CONNECTION", `Connection at index ${index} must be an object.`));
        return;
      }
      const connectionId = readString(raw["id"], `connections[${index}].id`, diagnostics);
      const source = parseEndpoint(raw["source"], `connections[${index}].source`, diagnostics);
      const target = parseEndpoint(raw["target"], `connections[${index}].target`, diagnostics);
      const kind = readString(raw["kind"], `connections[${index}].kind`, diagnostics);
      if (
        connectionId !== undefined &&
        source !== undefined &&
        target !== undefined &&
        kind !== undefined &&
        ["data", "execution", "event", "reference"].includes(kind)
      ) {
        connections.push({ id: connectionId, source, target, kind: kind as PortKind });
      } else if (kind !== undefined && !["data", "execution", "event", "reference"].includes(kind)) {
        diagnostics.push(error("GRAPH_INVALID_CONNECTION", `Unknown connection kind "${kind}".`));
      }
    });
  }

  if (diagnostics.length > 0) return fail(diagnostics);
  return ok({
    schemaVersion: schemaVersion as string,
    id: id as string,
    kind: kind as string,
    name: name as string,
    nodes,
    connections,
  });
}
