import { error, hasErrors, type Diagnostic, type ValidationResult } from "../diagnostics.js";
import { buildExecutionChain } from "../graph/flow.js";
import { CORE_CONSOLE_LOG, CORE_START } from "../graph/nodes.js";
import { validateGraph } from "../graph/validate.js";
import type { GraphDocument, GraphNode } from "../graph/types.js";
import {
  IR_VERSION,
  unitType,
  type IrExpression,
  type IrModule,
  type IrStatement,
} from "./types.js";

function lowerNode(node: GraphNode, graph: GraphDocument): { statements: IrStatement[]; diagnostics: Diagnostic[] } {
  const origin = { graphId: graph.id, nodeId: node.id };
  if (node.definitionId === CORE_CONSOLE_LOG.definitionId) {
    const value = node.properties["message"];
    if (typeof value !== "string") {
      return {
        statements: [],
        diagnostics: [
          error("IR_PROPERTY_NOT_LOWERABLE", "Console Log message must be a string literal in the MVP.", origin),
        ],
      };
    }
    const argument: IrExpression = { kind: "string", value };
    return {
      statements: [{ kind: "call", target: "core.console.log", arguments: [argument], origin }],
      diagnostics: [],
    };
  }
  return {
    statements: [],
    diagnostics: [
      error(
        "IR_NODE_UNSUPPORTED",
        `Node definition "${node.definitionId}" has no IR lowering handler.`,
        origin,
        "Use a supported node or provide a lowering plugin.",
      ),
    ],
  };
}

/** Lower a validated structured-flow graph into the versioned semantic IR. */
export function lowerGraph(graph: GraphDocument): ValidationResult<IrModule> {
  const diagnostics = validateGraph(graph);
  if (hasErrors(diagnostics)) return { ok: false, diagnostics };

  const chain = buildExecutionChain(graph, diagnostics);
  if (hasErrors(diagnostics) || chain.length === 0) return { ok: false, diagnostics };

  const start = chain[0]!;
  const body: IrStatement[] = [];
  for (const node of chain.slice(1)) {
    const lowered = lowerNode(node, graph);
    diagnostics.push(...lowered.diagnostics);
    body.push(...lowered.statements);
  }
  if (hasErrors(diagnostics)) return { ok: false, diagnostics };

  const last = chain[chain.length - 1]!;
  body.push({
    kind: "return",
    origin: { graphId: graph.id, nodeId: last.id },
  });

  const ir: IrModule = {
    irVersion: IR_VERSION,
    id: graph.id,
    functions: [
      {
        id: "main",
        parameters: [],
        returnType: unitType(),
        body,
        origin: { graphId: graph.id, nodeId: start.id },
      },
    ],
  };
  return { ok: true, value: ir, diagnostics };
}
