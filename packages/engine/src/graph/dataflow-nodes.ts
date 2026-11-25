import { TYPES } from "./types.js";
import type { NodeDefinition, NodeDefinitionRegistry, PortDefinition } from "./nodes.js";

const intOutput: PortDefinition = {
  id: "value",
  direction: "output",
  kind: "data",
  type: TYPES.i32,
  description: "Integer value produced by this node.",
};

const leftInput: PortDefinition = {
  id: "left",
  direction: "input",
  kind: "data",
  type: TYPES.i32,
  required: true,
  description: "Left operand.",
};

const rightInput: PortDefinition = {
  id: "right",
  direction: "input",
  kind: "data",
  type: TYPES.i32,
  required: true,
  description: "Right operand.",
};

const intInput: PortDefinition = {
  id: "value",
  direction: "input",
  kind: "data",
  type: TYPES.i32,
  required: true,
  description: "Integer value consumed by this node.",
};

export const CORE_INT_LITERAL: NodeDefinition = {
  definitionId: "visulith.core.data.int-literal",
  version: "0.1",
  displayName: "Integer Literal",
  category: "data",
  inputs: [],
  outputs: [intOutput],
  properties: [{ key: "value", type: TYPES.i32, required: true }],
  capabilities: ["dataflow", "ir-export"],
};

export const CORE_ADD: NodeDefinition = {
  definitionId: "visulith.core.data.add",
  version: "0.1",
  displayName: "Add Integers",
  category: "math",
  inputs: [leftInput, rightInput],
  outputs: [
    {
      id: "result",
      direction: "output",
      kind: "data",
      type: TYPES.i32,
      description: "Sum of both operands.",
    },
  ],
  properties: [],
  capabilities: ["dataflow", "ir-export", "arithmetic"],
};

export const CORE_DATA_LOG: NodeDefinition = {
  definitionId: "visulith.core.data.log",
  version: "0.1",
  displayName: "Log Value",
  category: "io",
  inputs: [intInput],
  outputs: [],
  properties: [],
  capabilities: ["dataflow", "ir-export", "io"],
};

export const DATAFLOW_NODE_DEFINITIONS: NodeDefinitionRegistry = new Map<string, NodeDefinition>([
  [CORE_INT_LITERAL.definitionId, CORE_INT_LITERAL],
  [CORE_ADD.definitionId, CORE_ADD],
  [CORE_DATA_LOG.definitionId, CORE_DATA_LOG],
]);
