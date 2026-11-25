import { error, hasErrors, type Diagnostic, type ValidationResult } from "../diagnostics.js";
import { analyzeFlow, executionKey, type FlowAnalysis } from "../graph/flow.js";
import { CORE_CONSOLE_LOG, CORE_IF, CORE_REPEAT, CORE_SET_VARIABLE, CORE_START } from "../graph/nodes.js";
import { validateGraph } from "../graph/validate.js";
import type { GraphDocument, GraphNode } from "../graph/types.js";
import {
  IR_VERSION,
  unitType,
  type IrBinaryOperator,
  type IrExpression,
  type IrModule,
  type IrStatement,
} from "./types.js";

interface LoweringContext {
  graph: GraphDocument;
  analysis: FlowAnalysis;
  diagnostics: Diagnostic[];
}

function stringProperty(node: GraphNode, key: string, context: LoweringContext): string | undefined {
  const value = node.properties[key];
  if (typeof value === "string") return value;
  context.diagnostics.push(
    error("IR_PROPERTY_NOT_LOWERABLE", `Property "${key}" must be a string literal in the MVP.`, {
      graphId: context.graph.id,
      nodeId: node.id,
    }),
  );
  return undefined;
}

function integerProperty(node: GraphNode, key: string, context: LoweringContext): number | undefined {
  const value = node.properties[key];
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) return value;
  context.diagnostics.push(
    error(
      "IR_LOOP_COUNT_INVALID",
      `Property "${key}" must be a positive integer literal in the MVP.`,
      { graphId: context.graph.id, nodeId: node.id },
      "Set the Repeat count to a whole number greater than zero.",
    ),
  );
  return undefined;
}

function nextNode(node: GraphNode, portId: string, context: LoweringContext): string | undefined {
  return context.analysis.execByPort.get(executionKey(node.id, portId))?.target.nodeId;
}

function lowerSequence(startNodeId: string, context: LoweringContext, stopId?: string): IrStatement[] {
  const statements: IrStatement[] = [];
  const visiting = new Set<string>();
  let currentId: string | undefined = startNodeId;

  while (currentId !== undefined) {
    if (currentId === stopId) break; // A reconverging join is lowered once, after the conditional.
    if (visiting.has(currentId)) break; // Cycles are reported by flow analysis.
    visiting.add(currentId);
    const node = context.analysis.nodeById.get(currentId);
    if (node === undefined) break;
    const origin = { graphId: context.graph.id, nodeId: node.id };

    if (node.definitionId === CORE_START.definitionId) {
      currentId = nextNode(node, "exec-out", context);
      continue;
    }

    if (node.definitionId === CORE_CONSOLE_LOG.definitionId) {
      const message = stringProperty(node, "message", context);
      if (message !== undefined) {
        const argument: IrExpression = { kind: "string", value: message };
        statements.push({ kind: "call", target: "core.console.log", arguments: [argument], origin });
      }
      currentId = nextNode(node, "exec-out", context);
      continue;
    }

    if (node.definitionId === CORE_SET_VARIABLE.definitionId) {
      const name = stringProperty(node, "name", context);
      const value = stringProperty(node, "value", context);
      if (name !== undefined && value !== undefined) {
        statements.push({ kind: "variable", name, value: { kind: "string", value }, origin });
      }
      currentId = nextNode(node, "exec-out", context);
      continue;
    }

    if (node.definitionId === CORE_REPEAT.definitionId) {
      const count = integerProperty(node, "count", context);
      const bodyId = nextNode(node, "exec-body", context);
      const doneId = nextNode(node, "exec-done", context);
      if (count !== undefined && bodyId !== undefined) {
        statements.push({
          kind: "loop",
          count: { kind: "integer", value: count },
          body: lowerSequence(bodyId, context, node.id),
          origin,
        });
      }
      currentId = doneId;
      continue;
    }

    if (node.definitionId === CORE_IF.definitionId) {
      const name = stringProperty(node, "variable", context);
      const literal = stringProperty(node, "value", context);
      const rawOperator = stringProperty(node, "operator", context);
      const operator: IrBinaryOperator = rawOperator === "notEquals" ? "!==" : "===";
      if (name !== undefined && literal !== undefined && rawOperator !== undefined) {
        const condition: IrExpression = {
          kind: "binary",
          operator,
          left: { kind: "variable", name },
          right: { kind: "string", value: literal },
        };
        const trueId = nextNode(node, "exec-true", context);
        const falseId = nextNode(node, "exec-false", context);
        const joinId = context.analysis.joinByIf.get(node.id);
        statements.push({
          kind: "conditional",
          condition,
          thenBody: trueId !== undefined ? lowerSequence(trueId, context, joinId) : [],
          elseBody: falseId !== undefined ? lowerSequence(falseId, context, joinId) : [],
          origin,
        });
        currentId = joinId;
      } else {
        currentId = undefined;
      }
      continue;
    }

    context.diagnostics.push(
      error(
        "IR_NODE_UNSUPPORTED",
        `Node definition "${node.definitionId}" has no IR lowering handler.`,
        origin,
        "Use a supported node or provide a lowering plugin.",
      ),
    );
    currentId = undefined;
  }

  return statements;
}

/** Lower a validated structured-flow graph into the versioned semantic IR. */
export function lowerGraph(graph: GraphDocument): ValidationResult<IrModule> {
  const diagnostics = validateGraph(graph);
  if (hasErrors(diagnostics)) return { ok: false, diagnostics };

  const analysis = analyzeFlow(graph, diagnostics);
  if (analysis === undefined || hasErrors(diagnostics)) return { ok: false, diagnostics };

  const context: LoweringContext = { graph, analysis, diagnostics };
  const body = lowerSequence(analysis.start.id, context);
  if (hasErrors(diagnostics)) return { ok: false, diagnostics };

  body.push({
    kind: "return",
    origin: body.length > 0 ? body[body.length - 1]!.origin : { graphId: graph.id, nodeId: analysis.start.id },
  });

  return {
    ok: true,
    value: {
      irVersion: IR_VERSION,
      id: graph.id,
      functions: [
        {
          id: "main",
          parameters: [],
          returnType: unitType(),
          body,
          origin: { graphId: graph.id, nodeId: analysis.start.id },
        },
      ],
    },
    diagnostics,
  };
}
