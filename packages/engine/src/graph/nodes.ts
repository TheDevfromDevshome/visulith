import { TYPES, type PortDirection, type PortKind, type TypeRef } from "./types.js";

export interface PortDefinition {
  id: string;
  direction: PortDirection;
  kind: PortKind;
  type: TypeRef;
  required?: boolean;
  description?: string;
}

export interface PropertyDefinition {
  key: string;
  type: TypeRef;
  required: boolean;
  enumValues?: readonly string[];
}

export interface NodeDefinition {
  definitionId: string;
  version: string;
  displayName: string;
  category: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  properties: PropertyDefinition[];
  capabilities: string[];
}

export type NodeDefinitionRegistry = ReadonlyMap<string, NodeDefinition>;

const execIn: PortDefinition = {
  id: "exec-in",
  direction: "input",
  kind: "execution",
  type: TYPES.unit,
  required: true,
  description: "Previous statement in the execution chain.",
};

const execOut: PortDefinition = {
  id: "exec-out",
  direction: "output",
  kind: "execution",
  type: TYPES.unit,
  description: "Next statement in the execution chain.",
};

export const CORE_START: NodeDefinition = {
  definitionId: "visulith.core.start",
  version: "0.1",
  displayName: "Start",
  category: "flow",
  inputs: [],
  outputs: [execOut],
  properties: [],
  capabilities: ["structured-flow"],
};

export const CORE_CONSOLE_LOG: NodeDefinition = {
  definitionId: "visulith.core.console-log",
  version: "0.1",
  displayName: "Console Log",
  category: "io",
  inputs: [
    execIn,
    {
      id: "message",
      direction: "input",
      kind: "data",
      type: TYPES.string,
      required: false,
      description: "Message to print. Supplied by the message property in this PoC.",
    },
  ],
  outputs: [execOut],
  properties: [{ key: "message", type: TYPES.string, required: true }],
  capabilities: ["structured-flow", "ir-export"],
};

export const CORE_SET_VARIABLE: NodeDefinition = {
  definitionId: "visulith.core.set-variable",
  version: "0.1",
  displayName: "Set Variable",
  category: "data",
  inputs: [execIn],
  outputs: [execOut],
  properties: [
    { key: "name", type: TYPES.string, required: true },
    { key: "value", type: TYPES.string, required: true },
  ],
  capabilities: ["structured-flow", "ir-export"],
};

export const CORE_IF: NodeDefinition = {
  definitionId: "visulith.core.if",
  version: "0.1",
  displayName: "If",
  category: "flow",
  inputs: [execIn],
  outputs: [
    {
      id: "exec-true",
      direction: "output",
      kind: "execution",
      type: TYPES.unit,
      description: "Branch taken when the condition is true.",
    },
    {
      id: "exec-false",
      direction: "output",
      kind: "execution",
      type: TYPES.unit,
      description: "Branch taken when the condition is false.",
    },
  ],
  properties: [
    { key: "variable", type: TYPES.string, required: true },
    { key: "operator", type: TYPES.string, required: true, enumValues: ["equals", "notEquals"] },
    { key: "value", type: TYPES.string, required: true },
  ],
  capabilities: ["structured-flow", "ir-export", "branching"],
};

export const CORE_NODE_DEFINITIONS: NodeDefinitionRegistry = new Map<string, NodeDefinition>([
  [CORE_START.definitionId, CORE_START],
  [CORE_CONSOLE_LOG.definitionId, CORE_CONSOLE_LOG],
  [CORE_SET_VARIABLE.definitionId, CORE_SET_VARIABLE],
  [CORE_IF.definitionId, CORE_IF],
]);

export function isPropertyValueOfType(value: unknown, type: TypeRef, enumValues?: readonly string[]): boolean {
  if (enumValues !== undefined && (typeof value !== "string" || !enumValues.includes(value))) return false;
  switch (type.name) {
    case "core.string":
      return typeof value === "string";
    case "core.bool":
      return typeof value === "boolean";
    case "core.i32":
    case "core.f64":
      return typeof value === "number" && Number.isFinite(value);
    default:
      return false;
  }
}
