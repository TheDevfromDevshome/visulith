import {
  CORE_CONSOLE_LOG,
  CORE_IF,
  CORE_NODE_DEFINITIONS,
  CORE_REPEAT,
  CORE_SET_VARIABLE,
  CORE_START,
  typesEqual,
  type NodeDefinition,
  type PortDefinition,
  type PortDirection,
} from "@visulith/engine";

export const PALETTE_DEFINITIONS: readonly NodeDefinition[] = [
  CORE_START,
  CORE_CONSOLE_LOG,
  CORE_SET_VARIABLE,
  CORE_IF,
  CORE_REPEAT,
];

export function getNodeDefinition(definitionId: string): NodeDefinition | undefined {
  return CORE_NODE_DEFINITIONS.get(definitionId);
}

export function getPortDefinition(
  definitionId: string,
  direction: PortDirection,
  portId: string | null | undefined,
): PortDefinition | undefined {
  if (portId === null || portId === undefined) return undefined;
  const definition = getNodeDefinition(definitionId);
  if (definition === undefined) return undefined;
  const ports = direction === "input" ? definition.inputs : definition.outputs;
  return ports.find((port) => port.id === portId);
}

export function arePortsCompatible(source: PortDefinition, target: PortDefinition): boolean {
  return source.kind === target.kind && typesEqual(source.type, target.type);
}
